/**
 * Throwaway diagnostic v3 — reach AddWorkout + Diet-form screens, census
 * inputs with coverage checks, click-test around text, dump screenshots.
 * NOT part of the app; safe to delete.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8081;
const HOST = '127.0.0.1';
const CDP_PORT = 9224;

function getJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result);
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
  const res = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (res.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 600));
  return res.result.value;
}
async function click(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(300);
}

const INPUT_CENSUS = `(() => JSON.stringify({
  inputs: [...document.querySelectorAll('input,textarea')].map(el => {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
    const inVp = cx >= 0 && cy >= 0 && cx < innerWidth && cy < innerHeight;
    const at = inVp ? document.elementFromPoint(cx, cy) : null;
    const cs = getComputedStyle(el);
    return {
      ph: (el.placeholder || el.ariaLabel || '').slice(0, 24),
      x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      display: cs.display, opacity: cs.opacity,
      inVp,
      coveredBy: at ? (at === el ? 'self' : at.tagName + (at.getAttribute('role') ? '/' + at.getAttribute('role') : '') + '#' + (at.className || '').toString().slice(0, 30)) : 'offscreen'
    };
  })
}))()`;

const CARET_STATE = `(() => {
  const a = document.activeElement;
  const editableFocus = a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable === true);
  return JSON.stringify({
    tag: a ? a.tagName : null,
    editableFocus,
    caretVisible: !!editableFocus,
    selType: document.getSelection().type
  });
})()`;

// Click points spread over text-ish areas AND near/around input fields.
const CLICK_GRID = `(() => {
  const out = [];
  const vp = { w: innerWidth, h: innerHeight };
  // leaf text elements
  for (const el of document.querySelectorAll('div,span,h1,h2,h3,p')) {
    if (el.children.length > 2) continue;
    const txt = (el.textContent || '').trim();
    if (txt.length < 3 || txt.length > 44) continue;
    if (el.closest('input,textarea,[contenteditable]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 8 || r.top < 40 || r.bottom > vp.h - 90) continue;
    out.push({ kind: 'text', txt: txt.slice(0, 28), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
  }
  // points NEAR each input but outside it (10px above and below) — catches stretched inputs
  for (const el of document.querySelectorAll('input,textarea')) {
    const r = el.getBoundingClientRect();
    out.push({ kind: 'near-input', txt: 'near:' + (el.placeholder||'').slice(0,14), x: Math.round(r.left - 8), y: Math.round(r.top + r.height/2) });
    out.push({ kind: 'near-input', txt: 'below:' + (el.placeholder||'').slice(0,14), x: Math.round(r.left + r.width/2), y: Math.round(r.bottom + 8) });
  }
  const seen = new Set();
  return JSON.stringify(out.filter(t => { const k = t.kind + t.txt; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 50));
})()`;

async function censusAndClick(label, cdp, vp, shotName) {
  await sleep(700);
  console.log('--- ' + label + ' ---');
  const c = JSON.parse(await evalJson(cdp, INPUT_CENSUS));
  console.log('inputs:', c.inputs.length);
  for (const i of c.inputs) {
    const flag = (!i.inVp && i.display !== 'none') ? ' [OFFSCREEN!]' : (i.coveredBy !== 'self' ? ' [COVERED by ' + i.coveredBy + ']' : '');
    console.log('  input', JSON.stringify(i), flag);
  }
  if (shotName) {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync('scripts/' + shotName + '.png', Buffer.from(shot.data, 'base64'));
    console.log('  screenshot: scripts/' + shotName + '.png');
  }

  const targets = JSON.parse(await evalJson(cdp, CLICK_GRID));
  let bugs = 0;
  for (const t of targets) {
    // Re-resolve coordinates for text targets after possible scroll changes
    let x = t.x, y = t.y;
    if (t.kind === 'text') {
      const pos = JSON.parse(await evalJson(cdp,
        `(() => { const els=[...document.querySelectorAll('div,span,h1,h2,h3,p')]; const el=els.find(e=>(e.textContent||'').trim().slice(0,28)===${JSON.stringify(t.txt)} && e.children.length<=2); if(!el) return JSON.stringify({skip:1}); const r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), skip:r.width<20||r.top<40||r.bottom>innerHeight-90}); })()`));
      if (pos.skip) continue;
      x = pos.x; y = pos.y;
    } else {
      // near-input points: skip if out of view
      if (y < 40 || y > vp.h - 90) continue;
    }
    const who = await evalJson(cdp, `(() => { const el = document.elementFromPoint(${x}, ${y}); return el ? el.tagName + (el.type === 'text' ? ':input-text' : '') : 'none'; })()`);
    await click(cdp, x, y);
    const f = JSON.parse(await evalJson(cdp, CARET_STATE));
    const bug = f.editableFocus;
    if (bug) { bugs++; console.log('  BUG click "' + t.txt + '" @' + x + ',' + y + ' (hit ' + who + ') -> CARET on ' + f.tag); }
    else if (t.kind === 'near-input' && f.tag === 'INPUT') { bugs++; console.log('  BUG near-click "' + t.txt + '" -> focused INPUT (stretched field?)'); }
  }
  console.log(label, 'caret bugs:', bugs);
  return bugs;
}

const chromePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].find((p) => fs.existsSync(p));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-probe3-'));
const chrome = spawn(chromePath, ['--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${userDataDir}`,
  '--window-size=390,844', `http://localhost:${PORT}`], { stdio: 'ignore' });

let total = 0;
const vp = { w: 390, h: 844 };
try {
  let target = null;
  for (let i = 0; i < 30 && !target; i++) { await sleep(1000); const l = await getJson(`http://${HOST}:${CDP_PORT}/json/list`); if (Array.isArray(l)) target = l.find((t) => t.type === 'page'); }
  if (!target) throw new Error('no CDP target');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: vp.w, height: vp.h, deviceScaleFactor: 2, mobile: true });

  let mounted = false;
  for (let i = 0; i < 60; i++) { await sleep(1000); try { if ((await evalJson(cdp, `document.body.innerText`)).includes('Gym Tracker')) { mounted = true; break; } } catch {} }
  if (!mounted) throw new Error('app did not mount');
  console.log('mounted', vp.w + 'x' + vp.h);

  // ---- Navigate to Add Workout (with coverage debugging) ----
  const nav = JSON.parse(await evalJson(cdp, `(() => {
    const els=[...document.querySelectorAll('div[role="button"],button')];
    const el=els.find(e=>/Add workout/.test(e.textContent||''));
    if(!el) return JSON.stringify({found:false});
    const r=el.getBoundingClientRect();
    const cx=Math.round(r.left+r.width/2), cy=Math.round(r.top+r.height/2);
    const at=document.elementFromPoint(cx,cy);
    return JSON.stringify({found:true, x:cx, y:cy, rect:{y:Math.round(r.y),h:Math.round(r.height)},
      hit: at ? at.tagName + '|' + ((at.textContent||'').trim().slice(0,20)) : 'none',
      hitIsSelf: at === el || el.contains(at) });
  })()`));
  console.log('add-workout button:', JSON.stringify(nav));
  if (nav.found) {
    if (nav.y < 40 || nav.y > vp.h - 20) { await evalJson(cdp, `window.scrollTo(0, ${Math.max(0, nav.y - (vp.h - 120))}); 'ok'`); await sleep(300); }
    await click(cdp, nav.x, nav.y);
    await sleep(900);
  }
  const onAdd = await evalJson(cdp, `document.body.innerText.includes('Body part')`);
  console.log('navigated to AddWorkout:', onAdd);

  total += await censusAndClick('ADD WORKOUT', cdp, vp, 'screen-addworkout');

  // ---- Go back to tabs, open Diet, tap "Add diet" to open the form ----
  await evalJson(cdp, `window.scrollTo(0,0); 'ok'`);
  const back = JSON.parse(await evalJson(cdp, `(() => {
    const els=[...document.querySelectorAll('div[role="button"],button')];
    const el=els.find(e=>/Back/.test(e.textContent||''));
    if(!el) return JSON.stringify({found:false});
    const r=el.getBoundingClientRect();
    return JSON.stringify({found:true, x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)});
  })()`));
  if (back.found) { await click(cdp, back.x, back.y); await sleep(700); }

  const diet = JSON.parse(await evalJson(cdp, `(() => {
    const els=[...document.querySelectorAll('[role="tab"],div[role="button"],button')];
    const el=els.find(e=>/Diet/.test(e.textContent||''));
    if(!el) return JSON.stringify({found:false});
    const r=el.getBoundingClientRect();
    return JSON.stringify({found:true, x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)});
  })()`));
  if (diet.found) { await click(cdp, diet.x, diet.y); await sleep(900); }

  const addDiet = JSON.parse(await evalJson(cdp, `(() => {
    const els=[...document.querySelectorAll('div[role="button"],button')];
    const el=els.find(e=>/^Add diet$/.test((e.textContent||'').trim()));
    if(!el) return JSON.stringify({found:false});
    const r=el.getBoundingClientRect();
    return JSON.stringify({found:true, x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2)});
  })()`));
  console.log('add-diet button:', JSON.stringify(addDiet));
  if (addDiet.found) { await click(cdp, addDiet.x, addDiet.y); await sleep(700); }

  total += await censusAndClick('DIET FORM', cdp, vp, 'screen-diet-form');
} finally {
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
console.log('TOTAL caret bugs:', total);
process.exit(total > 0 ? 1 : 0);
