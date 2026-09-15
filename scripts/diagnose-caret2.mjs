/**
 * Throwaway diagnostic v2 — deeper probe: DOM census of editables + buttons,
 * navigate to AddWorkout and Diet screens, click near text, check focus.
 * NOT part of the app; safe to delete.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = 8081;
const HOST = '127.0.0.1';
const CDP_PORT = 9223;

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
  if (res.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(res.exceptionDetails).slice(0, 500));
  return res.result.value;
}
async function click(cdp, x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
  await sleep(250);
}

const GLOBAL_EDIT_CHECK = `(() => JSON.stringify({
  designMode: document.designMode,
  bodyCE: document.body.getAttribute('contenteditable'),
  ceCount: document.querySelectorAll('[contenteditable="true"],[contenteditable=""]').length,
  inputs: [...document.querySelectorAll('input,textarea')].map(el => {
    const r = el.getBoundingClientRect();
    const cx = Math.round(r.left + r.width/2), cy = Math.round(r.top + r.height/2);
    const at = document.elementFromPoint(cx, cy);
    return { ph: (el.placeholder||'').slice(0,20), w: Math.round(r.width), h: Math.round(r.height),
             x: Math.round(r.x), y: Math.round(r.y),
             topAtClick: at ? at.tagName + '/' + (at.getAttribute('role')||'') : 'off' };
  }),
  weirdButtons: [...document.querySelectorAll('button')].slice(0,10).map(b => ({
    txt: (b.textContent||'').trim().slice(0,20),
    aria: b.getAttribute('aria-label'),
    html: b.outerHTML.slice(0, 120)
  }))
}))()`;

const VISIBLE_CARET_CHECK = `(() => {
  const a = document.activeElement;
  const ce = a && (a.isContentEditable === true);
  const sel = document.getSelection();
  const anchorEditable = sel.anchorNode && sel.anchorNode.parentElement &&
    sel.anchorNode.parentElement.closest('[contenteditable="true"], input, textarea');
  return JSON.stringify({
    tag: a ? a.tagName : null, ce,
    visibleCaret: (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || ce)) || !!anchorEditable,
    selType: sel.type, selText: (sel.toString()||'').slice(0,20)
  });
})()`;

// Click near plain display text: headings, section titles, list rows.
const TEXT_TARGETS = `(() => {
  const out = [];
  const all = [...document.querySelectorAll('div,span,h1,h2,h3,p')];
  for (const el of all) {
    // leaf-ish text nodes only
    if (el.children.length > 2) continue;
    const txt = (el.textContent || '').trim();
    if (txt.length < 3 || txt.length > 40) continue;
    if (el.closest('input,textarea,[contenteditable]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 20 || r.height < 8) continue;
    if (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON') continue;
    out.push({ tag: el.tagName, txt: txt.slice(0, 26), x: Math.round(r.left + r.width/2), y: Math.round(r.top + r.height/2) });
  }
  // dedupe by text
  const seen = new Set();
  return JSON.stringify(out.filter(t => { const k = t.txt; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 40));
})()`;

async function probeScreen(label, cdp, vp) {
  await sleep(700);
  const g = JSON.parse(await evalJson(cdp, GLOBAL_EDIT_CHECK));
  console.log('--- ' + label + ' ---');
  console.log('designMode:', g.designMode, '| bodyCE:', g.bodyCE, '| contentEditable count:', g.ceCount);
  console.log('inputs:', g.inputs.length);
  for (const i of g.inputs) console.log('  input', JSON.stringify(i));
  if (g.weirdButtons.length) console.log('buttons:', JSON.stringify(g.weirdButtons));

  const targets = JSON.parse(await evalJson(cdp, TEXT_TARGETS));
  let bugs = 0;
  for (const t of targets) {
    let { x, y } = t;
    if (y < 20 || y > vp.h - 90) {
      await evalJson(cdp, `window.scrollTo(0, ${Math.max(0, y - 300)}); 'ok'`);
      await sleep(200);
    }
    const pos = JSON.parse(await evalJson(cdp,
      `(() => { const els=[...document.querySelectorAll('div,span,h1,h2,h3,p')]; const el=els.find(e=>(e.textContent||'').trim().slice(0,26)===${JSON.stringify(t.txt)} && e.children.length<=2); if(!el) return JSON.stringify({skip:1}); const r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2), y:Math.round(r.top+r.height/2), skip:r.width<20||r.height<8}); })()`));
    if (pos.skip || pos.y < 20 || pos.y > vp.h - 90) continue;
    await click(cdp, pos.x, pos.y);
    const f = JSON.parse(await evalJson(cdp, VISIBLE_CARET_CHECK));
    if (f.visibleCaret) { bugs++; console.log('  BUG click "' + t.txt + '" -> VISIBLE CARET on ' + f.tag + ' (sel=' + f.selType + ')'); }
    else console.log('  ok  click "' + t.txt + '" -> focus:' + f.tag + ' sel:' + f.selType);
  }
  console.log(label, 'visible-caret bugs:', bugs);
  return bugs;
}

const chromeCandidates = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
const chromePath = chromeCandidates.find((p) => fs.existsSync(p));
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chrome-probe2-'));
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
  for (let i = 0; i < 60; i++) { await sleep(1000); try { const t = await evalJson(cdp, `document.body.innerText.slice(0,2000)`); if (t.includes('Gym Tracker')) { mounted = true; break; } } catch {} }
  if (!mounted) throw new Error('app did not mount');
  console.log('mounted; viewport', vp.w + 'x' + vp.h);

  total += await probeScreen('HOME', cdp, vp);

  // Navigate: + Add workout
  const add = JSON.parse(await evalJson(cdp, `(() => { const els=[...document.querySelectorAll('div[role="button"],button')]; const el=els.find(e=>/Add workout/.test(e.textContent||'')); if(!el) return 'null'; const r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}); })()`));
  if (add && add.x) { await evalJson(cdp, `window.scrollTo(0,0);'ok'`); await click(cdp, add.x, add.y); total += await probeScreen('ADD WORKOUT', cdp, vp); }

  // Back to tabs: Diet
  const diet = JSON.parse(await evalJson(cdp, `(() => { const els=[...document.querySelectorAll('[role="tab"],button,div[role="button"]')]; const el=els.find(e=>/Diet/.test(e.textContent||'')); if(!el) return 'null'; const r=el.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2), txt:(el.textContent||'').slice(0,30)}); })()`));
  console.log('diet tab lookup:', JSON.stringify(diet));
  if (diet && diet.x) { await click(cdp, diet.x, diet.y); total += await probeScreen('DIET', cdp, vp); }
} finally {
  chrome.kill();
  try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch {}
}
console.log('TOTAL visible-caret bugs:', total);
process.exit(total > 0 ? 1 : 0);
