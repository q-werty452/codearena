// «Смотреть с телефона»: страница /w/<код> в headless Chrome размером с телефон,
// бот-учитель и боты-ученики на локальном сервере (npm run dev:server).
// Проверяет: чужая ссылка не открывается, урок и игра видны и обновляются сами,
// закрытие комнаты. Снимки — в CODEARENA_E2E_SHOTS (если задано).
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { watchToken } from "../../shared/src/watch.ts";
const WebSocket = createRequire(import.meta.url)("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SERVER = process.env.CODEARENA_SERVER ?? "127.0.0.1:8787";
const SHOTS = process.env.CODEARENA_E2E_SHOTS ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const results = [];
let ok = true;
const check = (name, cond, extra = "") => { results.push(`${cond ? "✓" : "✗"} ${name}${extra ? " — " + extra : ""}`); if (!cond) ok = false; };

// Комната и бот-учитель.
const { code, teacherToken } = await (await fetch(`http://${SERVER}/rooms`, { method: "POST" })).json();
const sock = (q = "") => new Promise((res) => {
  const ws = new WebSocket(`ws://${SERVER}/rooms/${code}/ws${q}`);
  const inbox = [];
  const me = { ws, inbox, send: (m) => ws.send(JSON.stringify(m)), file: "index.html", code: "", peeks: 0 };
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    inbox.push(m);
    // Ученик-бот отвечает на «покажи код» своим текущим файлом (как расширение).
    if (m.type === "peek_request") { me.peeks++; me.send({ type: "peek_reply", fileName: me.file, text: me.code }); }
    if (m.type === "hint") me.hint = m;
  });
  ws.on("open", () => res(me));
});
const teacher = await sock(`?teacher=${teacherToken}`);
const students = {};
for (const name of ["Айбек К.", "Нурай А.", "Тимур С.", "Алия Б."]) {
  const s = await sock();
  s.send({ type: "join", name });
  for (let i = 0; i < 50 && !s.inbox.some((m) => m.type === "joined"); i++) await sleep(50);
  s.id = s.inbox.find((m) => m.type === "joined").playerId;
  students[name] = s;
}
students["Нурай А."].code = "<!doctype html>\n<html>\n<body>\n  <h1>Привет от Нурай</h1>\n  <p>Абзац</p>\n</body>\n</html>\n";
students["Айбек К."].send({ type: "status", status: "done" });
students["Нурай А."].send({ type: "status", status: "lost" });
students["Нурай А."].send({ type: "confused" });
students["Тимур С."].send({ type: "progress", checkpoint: 0, percent: 60 });
students["Тимур С."].send({ type: "confused" });
students["Алия Б."].ws.close();
await sleep(300);

// Chrome «телефон».
const port = 9800 + Math.floor(Math.random() * 90);
const prof = mkdtempSync(join(tmpdir(), "ca-watch-"));
const chrome = spawn("google-chrome-stable", ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, "--lang=ru-RU", "--accept-lang=ru-RU,ru", "about:blank"], { stdio: "ignore" });
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
const cdp = new WebSocket(target.webSocketDebuggerUrl, { perMessageDeflate: false });
await new Promise((r) => cdp.on("open", r));
let id = 0; const pending = new Map(); const errors = [];
cdp.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === "Runtime.exceptionThrown") errors.push((m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text).slice(0, 300));
});
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); cdp.send(JSON.stringify({ id: i, method, params })); });
const text = async () => (await send("Runtime.evaluate", { expression: "document.body.innerText", returnByValue: true })).result?.result?.value ?? "";
const waitText = async (re, ms = 8000) => { const t0 = Date.now(); let t = ""; while (Date.now() - t0 < ms) { t = await text(); if (re.test(t)) return t; await sleep(150); } return null; };
const shot = async (name) => {
  if (!SHOTS) return;
  const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  writeFileSync(join(SHOTS, name), Buffer.from(r.result.data, "base64"));
  results.push("  screenshot: " + join(SHOTS, name));
};
await send("Runtime.enable"); await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
const base = `http://${SERVER}/w/${code}`;
// Каждый раз с чистой страницы: иначе смена только #фрагмента не перезагружает документ.
const open = async (url) => { await send("Page.navigate", { url: "about:blank" }); await sleep(200); await send("Page.navigate", { url }); };

try {
  // 1. Чужая ссылка: без токена и с неверным токеном.
  await open(base);
  check("no token → «link doesn't work»", !!(await waitText(/Ссылка не подходит/)));
  await open(base + "#t=" + "0".repeat(32));
  check("wrong token → «link doesn't work»", !!(await waitText(/Ссылка не подходит/, 15000)));

  // 2. Урок: крупная сводка, кто пишет / написал / не понял, прогресс.
  const tok = await watchToken(teacherToken);
  await open(base + "#t=" + tok);
  const t1 = await waitText(/Нурай А\./);
  const flat = (t) => (t ?? "").replace(/\s+/g, " ");
  check("lesson: students listed", !!t1, flat(t1).slice(0, 220));
  check("lesson: 1 of 4 finished", /1 из 4 написали/.test(flat(t1)));
  check("lesson: «1 не понял» and «2 просят объяснить ещё раз»", /1 не понял/.test(flat(t1)) && /2 просят объяснить ещё раз/.test(flat(t1)));
  check("lesson: Тимур 60% пишет", /Тимур С\. 60% пишет/.test(flat(t1)));
  check("lesson: Алия не в сети", /Алия Б\. не в сети/.test(flat(t1)));
  await shot("watch-lesson.png");

  // 3. Обновляется само.
  students["Тимур С."].send({ type: "progress", checkpoint: 0, percent: 100 });
  check("live update: Тимур 100% → 2 of 4 without reload", !!(await waitText(/2\s*из 4\s*написали/)));

  // 4. Код ученика по нажатию.
  const tap = (id) => send("Runtime.evaluate", { expression: `document.querySelector('.st[data-id="${id}"]').click()` });
  await tap(students["Нурай А."].id);
  const c1 = await waitText(/Привет от Нурай/);
  check("code: tap a student → their code", !!c1, flat(c1).slice(0, 160));
  check("code: file name shown", /index\.html/.test(c1 ?? ""));
  await shot("watch-code.png");
  students["Нурай А."].code = students["Нурай А."].code.replace("<p>Абзац</p>", "<p>Новая строка</p>");
  check("code: updates by itself (~5 s)", !!(await waitText(/Новая строка/, 9000)));
  check("code: teacher's VS Code got no peek_code from the phone", !teacher.inbox.some((m) => m.type === "peek_code"));

  // Подсказка: нажать на строку 4 → лист снизу → написать → «Отправить» → ученик получил.
  await send("Runtime.evaluate", { expression: `document.querySelector('.code.tap [data-n="4"]').click()` });
  const sh = await waitText(/Подсказка · строка 4[\s\S]*Отправить/);
  check("hint: tap line 4 → sheet", !!sh);
  await shot("watch-hint-sheet.png");
  await send("Runtime.evaluate", { expression: `(() => { const ta = document.querySelector('.sheet textarea'); ta.value = 'Закрой тег h1 и проверь отступ'; ta.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('.sheet .send').click(); })()` });
  const nu = students["Нурай А."];
  for (let i = 0; i < 50 && !nu.hint; i++) await sleep(100);
  check("hint: student got it on line 4", nu.hint?.line === 4 && nu.hint.text === "Закрой тег h1 и проверь отступ" && nu.hint.fileName === "index.html", JSON.stringify(nu.hint));
  check("hint: «sent» toast and the hint under the line", !!(await waitText(/Подсказка отправлена[\s\S]*|💬 Закрой тег h1/)) && !!(await waitText(/💬 Закрой тег h1 и проверь отступ/)));
  await shot("watch-hint-sent.png");
  await send("Runtime.evaluate", { expression: "history.back()" });
  check("code: back → the list", !!(await waitText(/из 4\s*написали/)));
  await tap(students["Алия Б."].id);
  check("code: offline student → explained", !!(await waitText(/Ученик не в сети/)));
  await send("Runtime.evaluate", { expression: "history.back()" });
  await waitText(/из 4\s*написали/);

  // 5. Игра (Codewars): таймер, ответили, отправленное решение с тестами.
  teacher.send({ type: "start_game", game: "codewars", settings: {}, tasks: [
    { type: "code", topic: "t", language: "python", prompt: "Верни чётные.", starter: "def evens(nums):\n    pass",
      tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }] },
  ] });
  await sleep(300);
  teacher.send({ type: "next" });
  const a = students["Айбек К."];
  for (let i = 0; i < 60 && !a.inbox.some((m) => m.type === "task"); i++) await sleep(100);
  const task = a.inbox.find((m) => m.type === "task");
  if (task) a.send({ type: "submit", taskId: task.taskId, code: "def evens(nums):\n    return [n for n in nums if n % 2 == 0]\n", report: { passed: 2, total: 2, failures: [] } });
  const t2 = await waitText(/Codewars[\s\S]*\d:\d\d[\s\S]*ответили 1 из 3/, 10000);
  check("game: Codewars, timer, answered 1 of 3", !!t2, flat(await text()).slice(0, 200));
  await shot("watch-game.png");
  await tap(a.id);
  await waitText(/Отправил/);
  await send("Runtime.evaluate", { expression: `document.querySelector('[data-tab="sent"]').click()` });
  const t3 = await waitText(/Прошёл тесты: 2 из 2[\s\S]*return \[n for n in nums/);
  check("game: submitted code with tests passed", !!t3, flat(await text()).slice(0, 200));
  await send("Runtime.evaluate", { expression: "history.back()" });
  teacher.send({ type: "end_game" });
  check("game over shown", !!(await waitText(/Игра окончена/)));
  teacher.send({ type: "reset_game" });
  check("back to lesson after the game", !!(await waitText(/^(?![\s\S]*Игра окончена)[\s\S]*из 4\s*написали/)));

  // 5. Учитель закрыл комнату.
  teacher.send({ type: "close_room" });
  check("room closed shown", !!(await waitText(/Комната закрыта/)));
  check("no JS errors on the page", errors.length === 0, errors.join(" | "));
} finally {
  cdp.close();
  chrome.kill();
  await new Promise((r) => chrome.once("exit", r));
  rmSync(prof, { recursive: true, force: true, maxRetries: 5 });
  for (const s of Object.values(students)) s.ws.close();
  teacher.ws.close();
}
console.log(results.join("\n"));
console.log(ok ? "WATCH PAGE OK" : "WATCH PAGE FAILED");
process.exit(ok ? 0 : 1);
