/**
 * Throwaway diagnostic script — CDP probe of the running web app.
 * NOT part of the app; safe to delete. Requires the Metro dev server on 8081.
 *
 * Usage: node scripts/diagnose-caret.mjs
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8081;
const HOST = '127.0.0.1';
const CDP_PORT = 9222;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(data);
          }
        });
      })
      .on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function evalJson(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (res.exceptionDetails) {
    throw new Error('page eval failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 400));
  }
  return res.result.value;
}

const INPUT_CENSUS = `(() => {
  const els = [...document.querySelectorAll('input,textarea')];
  const inputs = els.map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const inVp = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
    const at = inVp ? document.elementFromPoint(cx, cy) : null;
    return {
      ph: el.placeholder || el.getAttribute('aria-label') || '',
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      display: cs.display, vis: cs.visibility, op: cs.opacity, pe: cs.pointerEvents,
      inVp, areaPct: Math.round((100 * r.width * r.height) / (innerWidth * innerHeight)),
      coveredBy: at ? (at === el || el.contains(at) ? 'self' : at.tagName + '.' + (at.className || '').toString().slice(0, 20)) : 'offscreen'
    };
  });
  const rootEl = document.getElementById('root') || document.body;
  return JSON.stringify({
    vp: { w: innerWidth, h: innerHeight },
    count: els.length,
    inputs,
    rootUserSelect: getComputedStyle(rootEl).userSelect
  });
})()`;

const CLICK_TARGETS = `(() => {
  const sels = ['h1','h2','h3','div[role="button"]','button','[role="tab"]','span','p'];
  const out = [];
  for (const s of sels) {
    for (const el of document.querySelectorAll(s)) {
      const r = el.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) {
        out.push({
          tag: el.tagName,
          text: (el.textContent || '').trim().slice(0, 32),
          x: Math.round(r.left + r.width / 2),
          y: Math.round(r.top + r.height / 2)
        });
      }
    }
  }
  return JSON.stringify(out.slice(0, 80));
})()`;

const FOCUS_STATE = `(() => {
  const a = document.activeElement;
  return JSON.stringify({
    tag: a ? a.tagName : null,
    ph: a && a.placeholder ? String(a.placeholder).slice(0, 24) : null,
    selType: document.getSelection().type
  });
})()`;

async function runScreen(label, cdp) {
  await sleep(600);
  const census = JSON.parse(await evalJson(cdp, INPUT_CENSUS));
  console.log('--- ' + label + ' ---');
  console.log('viewport:', census.vp.w + 'x' + census.vp.h, '| inputs:', census.count, '| root userSelect:', census.rootUserSelect);
  for (const i of census.inputs) {
    console.log('  input', JSON.stringify(i));
  }

  const targets = JSON.parse(await evalJson(cdp, CLICK_TARGETS));
  let unexpected = 0;
  for (const t of targets) {
    // Bring target into the viewport if needed.
    if (t.y < 0 || t.y > census.vp.h) {
      await evalJson(cdp, `window.scrollTo(0, ${t.y - 200}); 'ok'`);
      await sleep(120);
    }
    const pos = JSON.parse(
      await evalJson(
        cdp,
        `(() => { const els=[...document.querySelectorAll('${t.tag.toLowerCase()}')]; const el=els.find(e=>(e.textContent||'').trim().slice(0,32)===${JSON.stringify(t.text)}); if(!el) return JSON.stringify({x:${t.x},y:${t.y}}); const r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2),skip:r.width<4}); })()`,
      ),
    );
    if (pos.skip || pos.y < 10 || pos.y > census.vp.h - 10) continue;
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pos.x, y: pos.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pos.x, y: pos.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(150);
    const focus = JSON.parse(await evalJson(cdp, FOCUS_STATE));
    const bad = focus.tag === 'INPUT' || focus.tag === 'TEXTAREA';
    if (bad) unexpected++;
    console.log(
      (bad ? '  BUG ' : '  ok  ') + 'click <' + t.tag + '> "' + t.text + '" -> focus: ' + focus.tag + (focus.ph ? ' (' + focus.ph + ')' : '') + (focus.selType && focus.selType !== 'None' ? ' sel=' + focus.selType : ''),
    );
  }
  console.log(label + ' unexpected input-focus count:', unexpected);
  return unexpected;
}

const chromeCandidates = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);
const chromePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!chromePath) throw new Error('Chrome not found');
console.log('chrome:', chromePath);

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-probe-'));
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${userDataDir}`,
    '--window-size=390,844',
    `http://localhost:${PORT}`,
  ],
  { stdio: 'ignore' },
);

let totalBugs = 0;
try {
  // Wait for the CDP target.
  let target = null;
  for (let i = 0; i < 30 && !target; i++) {
    await sleep(1000);
    const list = await getJson(`http://${HOST}:${CDP_PORT}/json/list`);
    if (Array.isArray(list)) target = list.find((t) => t.type === 'page');
  }
  if (!target) throw new Error('no CDP page target');
  console.log('connected to page:', target.url);

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });
  const cdp = new CDP(ws);

  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  // Real phone-sized viewport (task 4).
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    mobile: true,
  });

  // Wait for React to mount.
  let mounted = false;
  for (let i = 0; i < 60; i++) {
    await sleep(1000);
    try {
      const txt = await evalJson(cdp, `document.body ? document.body.innerText.slice(0, 4000) : ''`);
      if (txt && txt.includes('Gym Tracker')) {
        mounted = true;
        break;
      }
    } catch {
      /* bundle still loading */
    }
  }
  if (!mounted) throw new Error('app did not mount (no "Gym Tracker" text)');
  console.log('app mounted at phone viewport 390x844');

  totalBugs += await runScreen('HOME / WORKOUT', cdp);

  // Tab to Diet.
  await evalJson(cdp, `window.scrollTo(0, 0); 'ok'`);
  const tab = JSON.parse(await evalJson(cdp, `(() => { const els=[...document.querySelectorAll('[role="tab"],div[role="button"]')]; const t=els.find(e=>/Diet/.test(e.textContent||'')); if(!t) return 'null'; const r=t.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}); })()`));
  if (tab && tab.x) {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: tab.x, y: tab.y, button: 'left', buttons: 1, clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: tab.x, y: tab.y, button: 'left', buttons: 0, clickCount: 1 });
    await sleep(800);
    totalBugs += await runScreen('DIET', cdp);
  } else {
    console.log('Diet tab not found — skipping diet screen');
  }

  // Screenshot for the layout check.
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('scripts/screen-diet.png', Buffer.from(shot.data, 'base64'));
  console.log('saved scripts/screen-diet.png');
} finally {
  chrome.kill();
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch {}
}

console.log('TOTAL unexpected input-focus bugs:', totalBugs);
process.exit(totalBugs > 0 ? 1 : 0);
