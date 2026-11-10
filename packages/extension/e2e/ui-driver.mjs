// Клики в webview CodeArena внутри настоящего VS Code через Chrome DevTools Protocol.
// Учитель: «Начать игру» → каждая игра → «Взять пример» → окно «ИИ». Ловит ошибки интерфейса.
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function drive(port, handoff) {
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
  const ev = (expr) => Promise.race([new Promise((r) => setTimeout(() => r("EVAL TIMEOUT"), 60000)), panel.s.send("Runtime.evaluate", { contextId: panel.c, expression: expr, awaitPromise: true, returnByValue: true }).then((r) => r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description)]);
  await ev(`window.__errs=[]; addEventListener('error',e=>__errs.push('error: '+(e.error&&e.error.stack||e.message))); addEventListener('unhandledrejection',e=>__errs.push('rej: '+(e.reason&&e.reason.stack||e.reason))); const ce=console.error; console.error=(...a)=>{__errs.push('console.error: '+a.map(String).join(' ').slice(0,1500)); ce(...a)}; 'ok'`);
  const sleepJs = "new Promise(r=>setTimeout(r,900))";
  const results = []; let ok = true;
  results.push("start → " + await ev(`(async()=>{const b=[...document.querySelectorAll('button')].filter(x=>/^(Начать игру|Start game)/.test(x.textContent.trim())); b.at(-1)?.click(); await ${sleepJs}; return (document.querySelector('h1')||{}).textContent})()`));
  for (const g of ["Викторина|Quiz", "Найди баг|Find the bug", "Codewars", "Гонка|Race"]) {
    const r = await ev(`(async()=>{const re=/^(${g})/; const card=[...document.querySelectorAll('button')].find(x=>re.test(x.querySelector('div')?.textContent||'')); card?.click(); await ${sleepJs}; const ex=[...document.querySelectorAll('button')].find(x=>/^(Use example|Взять пример)$/.test(x.textContent.trim())); ex?.click(); await ${sleepJs}; const ai=[...document.querySelectorAll('button')].find(x=>/^(AI|ИИ)$/.test(x.textContent.trim())); ai?.click(); await ${sleepJs}; const dlg=!!document.querySelector('[role=dialog]'); document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await ${sleepJs}; const res={example:!!ex,aiDialog:dlg,card:!!card,h1:(document.querySelector('h1')||{}).textContent,len:document.getElementById('root').innerHTML.length,errs:__errs.slice(0,3)}; const back=[...document.querySelectorAll('button')].find(x=>/Выберите игру|Choose a game/.test(x.textContent)); back?.click(); await ${sleepJs}; return JSON.stringify(res)})()`);
    results.push(g + " → " + r);
    try { const j = JSON.parse(r); if (!j.card || !j.h1 || !j.example || !j.aiDialog || j.errs.length) ok = false; } catch { ok = false; }
  }

  // Помощники в странице: клик по кнопке по тексту, «протыкать» все кнопки и поля внутри контейнера.
  await ev(`window.__h = {
    wait: (ms=500) => new Promise(r=>setTimeout(r,ms)),
    btn: (re, root=document) => [...root.querySelectorAll('button')].find(x=>re.test(x.textContent.trim())),
    alive: () => (document.getElementById('root')?.innerText.trim().length||0) > 20 && !/Что-то сломалось|Something went wrong/.test(document.body.innerText),
    type: (el, v) => { const proto = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); },
    async sweep(getRoot, deny, max = 45) {
      let clicked = 0;
      for (let pass = 0; pass < 2; pass++) {
        const root = getRoot(); if (!root) break;
        for (const el of root.querySelectorAll('input:not([type=checkbox]):not([type=file]):not([type=range]), textarea')) { __h.type(el, el.type==='number' ? '3' : 'Теги HTML и ссылки'); await __h.wait(60); }
        const items = [...root.querySelectorAll('button, [role=switch], [role=radio], input[type=checkbox], select')];
        for (const b of items) {
          if (clicked >= max) return { clicked };
          if (!b.isConnected || b.disabled) continue;
          const label = (b.textContent || b.getAttribute('aria-label') || '').trim();
          if (deny.test(label)) continue;
          if (b.tagName==='SELECT') { if (b.options.length>1) { b.selectedIndex = (b.selectedIndex+1)%b.options.length; b.dispatchEvent(new Event('change',{bubbles:true})); } }
          else b.click();
          clicked++; await __h.wait(80);
          if (!__h.alive()) return { clicked, brokeOn: label.slice(0,40) };
        }
      }
      return { clicked };
    },
  }; 'ok'`);
  const DENY = String.raw`/^(Начать|Start|Выйти|Leave|Закрыть комнату|Close room|Загрузить файл|Import a file|Ввести ключ|Enter key|Сгенерировать|Создать$|Generate|Удалить ключ|Remove key|.*Выберите игру|.*Choose a game)/`;
  const check = async (name, js) => {
    const r = await ev(`(async()=>{ __errs.length=0; ${js}; await __h.wait(700); return JSON.stringify({...res, alive: __h.alive(), errs: __errs.slice(0,3), ...(res.skipped||res.fail||res.clicked===0 ? { buttons: [...document.querySelectorAll('button')].map(b=>b.textContent.trim().slice(0,20)).filter(Boolean).slice(0,25) } : {})}) })()`);
    results.push(name + " → " + r);
    try { const j = JSON.parse(r); if (!j.alive || j.errs.length || j.brokeOn || j.fail) ok = false; } catch { ok = false; }
  };
  // На выбор игры: из редактора — «‹ Выберите игру», из урока — «Начать игру».
  const back = `__h.btn(/Выберите игру|Choose a game/)?.click(); await __h.wait(); if (!document.querySelector('h1')?.textContent.match(/Выберите игру|Choose a game/)) { [...document.querySelectorAll('button')].filter(x=>/^(Начать игру|Start game)/.test(x.textContent.trim())).at(-1)?.click(); await __h.wait(900); }`;
  const openGame = (g) => `${back} const card=[...document.querySelectorAll('button')].find(x=>/^(${g})/.test(x.querySelector('div')?.textContent||'')); card?.click(); await __h.wait(900);`;
  const dlg = `() => document.querySelector('[role=dialog]')`;
  const esc = `if (document.querySelector('[role=dialog]')) document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); if (document.querySelector('[role=dialog]')) window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await __h.wait();`;

  // ИИ: выбрать игры, языки, сложность, ввести тему — тут падало в 0.1.0. Ссылка на ключ — через расширение.
  await check("AI dialog: every control + key link", `${openGame("Викторина|Quiz")} __h.btn(/^(AI|ИИ)$/)?.click(); await __h.wait(900);
    const s1 = await __h.sweep(${dlg}, ${DENY});
    const a = document.querySelector('[role=dialog] a'); let nav = null;
    if (a) { const e = new MouseEvent('click',{bubbles:true,cancelable:true,button:0}); a.dispatchEvent(e); nav = e.defaultPrevented; }
    const res = { ...s1, link: a?.href, linkStaysInPanel: nav, fail: !a || nav !== true || s1.clicked < 8 }; ${esc}`);
  for (const g of ["Викторина|Quiz", "Перетягивание|Tug", "Codewars", "Найди баг|Find the bug", "Гонка|Race"]) {
    await check(`${g.split("|")[0]}: editor controls`, `${openGame(g)} const ed = document.getElementById('root'); const h1 = document.querySelector('h1')?.textContent; const gc = [...document.querySelectorAll('button')].find(x=>/^(${g})/.test(x.querySelector('div')?.textContent||'')); if (gc?.disabled) { var res = { disabledCard: gc.textContent.slice(0,60) }; } else { var res = { h1, ...await __h.sweep(() => ed, ${DENY}) }; res.fail = res.clicked < 3 || /Выберите игру|Choose a game/.test(h1||'') || !h1; } ${esc}`);
    await check(`${g.split("|")[0]}: bank dialog`, `${openGame(g)} const o = __h.btn(/^(Из банка|From the bank)/); o?.click(); await __h.wait(900); const res = o ? await __h.sweep(${dlg}, ${DENY}) : { skipped: true, fail: /Викторина|Quiz/.test('${g}') }; ${esc}`);
  }
  await check("picker: paste dialog", `${back} __h.btn(/Вставить текст|Paste text/)?.click(); await __h.wait(900); const d = document.querySelector('[role=dialog]'); const ta = d?.querySelector('textarea'); if (ta) __h.type(ta, "1. Какой тег создаёт ссылку?\\n- <div>\\n+ <a>\\n\\n2. Свойство цвета?\\n= color"); await __h.wait(400); const add = __h.btn(/^(Добавить|Add) \\d/); add?.click(); await __h.wait(900); const res = { found: !!add, fail: !ta || !add }; ${esc} ${esc}`);
  await check("picker: AI dialog from My tasks", `${back} __h.btn(/Создать с ИИ|Generate with AI/)?.click(); await __h.wait(900); const res = await __h.sweep(${dlg}, ${DENY}); ${esc}`);

  // Ссылка должна дойти до расширения (vscode.env.openExternal), а не уйти в webview.
  if (handoff) {
    const { readFileSync, existsSync } = await import("node:fs");
    await sleep(1500);
    const urls = existsSync(handoff + ".urls") ? readFileSync(handoff + ".urls", "utf8") : "";
    const xdg = existsSync(handoff + ".xdg") ? readFileSync(handoff + ".xdg", "utf8") : "";
    const opened = /aistudio\.google\.com\/apikey/.test(urls + xdg);
    results.push("key link opened by the extension → " + opened + (xdg ? " (via xdg-open)" : ""));
    if (!opened) ok = false;
  }
  return { ok, results };
}
