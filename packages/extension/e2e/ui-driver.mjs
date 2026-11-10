// Клики в webview CodeArena внутри настоящего VS Code через Chrome DevTools Protocol.
// Учитель: «Начать игру» → каждая игра → «Взять пример» → окно «ИИ». Ловит ошибки интерфейса.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function drive(port) {
  let id = 0;
  function session(wsUrl) {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false });
    const pending = new Map();
    const events = [];
    ws.on("message", (d) => {
      const m = JSON.parse(d);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
      else if (m.method) events.push(m);
    });
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    return Promise.race([new Promise((res) => ws.on("open", () => res({ send, events, ws }))), new Promise((_, rej) => setTimeout(() => rej(new Error("ws open timeout")), 8000))]);
  }
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();

  const webviews = targets.filter((t) => t.type === "iframe" && /vscode-webview/.test(t.url));
  let panel = null;
  for (const t of webviews) {
    let s; try { s = await session(t.webSocketDebuggerUrl); } catch (e) { console.log("skip", t.url.slice(0, 60), e.message); continue; }
    await s.send("Runtime.enable");
    await sleep(300);
    // Контексты: внутренний фрейм с нашим документом — тот, где есть #root.
    const ctxs = s.events.filter((e) => e.method === "Runtime.executionContextCreated").map((e) => e.params.context.id);
    for (const c of ctxs) {
      const r = await s.send("Runtime.evaluate", { contextId: c, expression: "document.getElementById('root') ? (window.__CODEARENA__||{}).view + ':' + document.body.innerText.slice(0,80) : ''", returnByValue: true });
      const v = r.result?.result?.value;
      if (v && v.startsWith("panel")) panel = { s, c };
    }
    if (!panel) s.ws.close();
  }
  if (!panel) return { ok: false, results: ["no CodeArena panel webview found"] };
  const ev = (expr) => Promise.race([new Promise((r) => setTimeout(() => r("EVAL TIMEOUT"), 15000)), panel.s.send("Runtime.evaluate", { contextId: panel.c, expression: expr, awaitPromise: true, returnByValue: true }).then((r) => r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description)]);
  await ev(`window.__errs=[]; addEventListener('error',e=>__errs.push('error: '+(e.error&&e.error.stack||e.message))); addEventListener('unhandledrejection',e=>__errs.push('rej: '+(e.reason&&e.reason.stack||e.reason))); const ce=console.error; console.error=(...a)=>{__errs.push('console.error: '+a.map(String).join(' ').slice(0,1500)); ce(...a)}; 'ok'`);
  const sleepJs = "new Promise(r=>setTimeout(r,900))";
  const results = []; let ok = true;
  results.push("start → " + await ev(`(async()=>{const b=[...document.querySelectorAll('button')].filter(x=>/^(Начать игру|Start game)/.test(x.textContent.trim())); b.at(-1)?.click(); await ${sleepJs}; return (document.querySelector('h1')||{}).textContent})()`));
  for (const g of ["Викторина|Quiz", "Найди баг|Find the bug", "Codewars", "Гонка|Race"]) {
    const r = await ev(`(async()=>{const re=/^(${g})/; const card=[...document.querySelectorAll('button')].find(x=>re.test(x.querySelector('div')?.textContent||'')); card?.click(); await ${sleepJs}; const ex=[...document.querySelectorAll('button')].find(x=>/^(Use example|Взять пример)$/.test(x.textContent.trim())); ex?.click(); await ${sleepJs}; const ai=[...document.querySelectorAll('button')].find(x=>/^(AI|ИИ)$/.test(x.textContent.trim())); ai?.click(); await ${sleepJs}; const dlg=!!document.querySelector('[role=dialog]'); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await ${sleepJs}; const res={example:!!ex,aiDialog:dlg,card:!!card,h1:(document.querySelector('h1')||{}).textContent,len:document.getElementById('root').innerHTML.length,errs:__errs.slice(0,3)}; const back=[...document.querySelectorAll('button')].find(x=>/Выберите игру|Choose a game/.test(x.textContent)); back?.click(); await ${sleepJs}; return JSON.stringify(res)})()`);
    results.push(g + " → " + r);
    try { const j = JSON.parse(r); if (!j.card || !j.h1 || !j.example || !j.aiDialog || j.errs.length) ok = false; } catch { ok = false; }
  }

  return { ok, results };
}
