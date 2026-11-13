// Каждое задание банка на экране игры: витрина (vite, `npm run dev -w @codearena/webview-ui`)
// + headless Chrome. Ловит «Что-то сломалось», ошибки JS, пустой экран и потерянный блок кода.
//   node e2e/bank-render.mjs                      — все наборы из tasks/
//   node e2e/bank-render.mjs python/quiz.json …   — только эти
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const WebSocket = createRequire(import.meta.url)("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const here = dirname(fileURLToPath(import.meta.url));
const TASKS = resolve(here, "../../../tasks");
const GALLERY = process.env.GALLERY ?? "http://127.0.0.1:5173/";
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith(".json") ? [relative(TASKS, join(d, f))] : []));
const SETS = process.argv.slice(2).length ? process.argv.slice(2) : walk(TASKS);

const port = 9600 + Math.floor(Math.random() * 90);
const prof = mkdtempSync(join(tmpdir(), "ca-bank-"));
const chrome = spawn("google-chrome-stable", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--window-size=1200,900", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {} }
const ws = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => ws.on("open", r));
let id = 0; const pending = new Map(); let errs = [];
ws.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errs.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (e) => (await send("Runtime.evaluate", { expression: e, returnByValue: true })).result?.result?.value;
await send("Runtime.enable"); await send("Page.enable");

let bad = 0, ok = 0;
try {
  for (const set of SETS) {
    const data = JSON.parse(readFileSync(join(TASKS, set), "utf8"));
    for (let i = 0; i < data.tasks.length; i++) {
      const t = data.tasks[i];
      errs = [];
      await send("Page.navigate", { url: `${GALLERY}?tab=${data.game}&shot&lang=ru&bank=${set}&start=${i}` });
      // На экране должно появиться начало задания (или первая строка кода для «найди строку»).
      const probe = t.prompt.split("\n")[0].replace(/`/g, "").slice(0, 18);
      const probe2 = t.type === "find_line" ? t.code.split("\n")[0].trim().slice(0, 15) : null;
      let seen = false, text = "";
      for (let k = 0; k < 60 && !seen; k++) {
        await sleep(100);
        text = (await ev("document.body.innerText")) ?? "";
        seen = text.includes(probe) || (probe2 !== null && text.includes(probe2));
      }
      const broken = /Что-то сломалось|Something went wrong/.test(text);
      const hasPre = /```/.test(t.prompt) ? await ev("!!document.querySelector('pre')") : true;
      if (!seen || broken || errs.length || !hasPre) { bad++; console.log("✗", set, "#" + (i + 1), JSON.stringify({ seen, broken, hasPre, probe, err: errs[0]?.slice(0, 120) })); }
      else ok++;
    }
    console.log(`  ${set}: done`);
  }
} finally {
  ws.close(); chrome.kill(); await new Promise((r) => chrome.once("exit", r)); rmSync(prof, { recursive: true, force: true, maxRetries: 5 });
}
console.log(`checked ${ok + bad} tasks: ${ok} ok, ${bad} bad`);
process.exit(bad ? 1 : 0);
