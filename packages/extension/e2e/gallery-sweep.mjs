// Протыкать все экраны витрины (vite, devHost ведёт себя как VS Code) в headless Chrome:
// каждая вкладка → клики по всем кнопкам, ввод в поля → ловим ошибки и экран «Что-то сломалось».
// Запуск: (cd packages/webview-ui && npm run dev) ; node e2e/gallery-sweep.mjs
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
const WebSocket = createRequire(import.meta.url)("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = process.env.GALLERY ?? "http://127.0.0.1:5173/";
const TABS = ["teacher", "student", "join", "ended", "quiz", "tug", "codewars", "bug", "race"];
const port = 9900 + Math.floor(Math.random() * 90);
const prof = mkdtempSync(join(tmpdir(), "ca-sweep-"));
const chrome = spawn("google-chrome-stable", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--window-size=1400,900", "about:blank"], { stdio: "ignore" });

let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.on("open", r));
let id = 0; const pending = new Map(); const errors = [];
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push("exception: " + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 400));
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => (await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable");

const SWEEP = String.raw`(async () => {
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  const broken = () => /Что-то сломалось|Something went wrong/.test(document.body.innerText);
  const deny = /^(Выйти|Leave|Закрыть комнату|Close room|Загрузить файл|Import a file)/;
  const type = (el, v) => { const p = el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(p,'value').set.call(el, v); el.dispatchEvent(new Event('input',{bubbles:true})); };
  let clicked = 0; const seen = new Set();
  for (let pass = 0; pass < 3; pass++) {
    for (const el of document.querySelectorAll('input:not([type=checkbox]):not([type=file]):not([type=range]), textarea')) { if (el.isConnected) { type(el, el.type==='number'?'3':'Айбек'); await wait(40); } }
    for (const b of [...document.querySelectorAll('button, [role=switch], [role=radio], a')]) {
      if (!b.isConnected || b.disabled) continue;
      const label = (b.textContent || b.getAttribute('aria-label') || '').trim();
      if (deny.test(label) || clicked > 120) continue;
      const key = pass + ':' + label; if (seen.has(key)) continue; seen.add(key);
      const e = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      b.dispatchEvent(e);
      if (b.tagName === 'A' && !e.defaultPrevented) return { clicked, navigatesAway: b.href };
      clicked++; await wait(70);
      if (broken()) return { clicked, brokeOn: label.slice(0, 50) };
      if (document.querySelector('[role=dialog]') && Math.random() < 0.5) { document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await wait(120); }
    }
    await wait(400);
  }
  return { clicked, alive: !broken() && document.body.innerText.trim().length > 20 };
})()`;

let ok = true;
for (const lang of ["ru", "en"]) for (const tab of TABS) {
  errors.length = 0;
  await send("Page.navigate", { url: `${BASE}?tab=${tab}&shot&lang=${lang}` });
  await sleep(1800);
  const r = await ev(SWEEP);
  await sleep(500);
  const bad = !r || r.brokeOn || r.navigatesAway || r.alive === false || errors.length;
  if (bad) ok = false;
  console.log(`${bad ? "✗" : "✓"} ${lang}/${tab}: ${JSON.stringify(r)}${errors.length ? "\n    " + [...new Set(errors)].slice(0, 4).join("\n    ") : ""}`);
}
ws.close(); chrome.kill();
await new Promise((r) => chrome.once("exit", r));
rmSync(prof, { recursive: true, force: true, maxRetries: 5 });
console.log(ok ? "GALLERY SWEEP OK" : "GALLERY SWEEP FAILED");
process.exit(ok ? 0 : 1);
