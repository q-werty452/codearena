// Нагрузка: учитель + телефон учителя + N учеников (по умолчанию 30) в одной комнате.
// Урок (показ файла, прогресс, статусы, «посмотреть код», подсказки) и все игры:
// викторина, канат, Codewars, гонка. Меряет задержки (p50/p95/max) и потери сообщений.
//   node e2e/load.mjs                         — локальный сервер (npm run dev:server)
//   CODEARENA_SERVER=https://… node e2e/load.mjs  — настоящий сервер
//   CODEARENA_LOAD_N=40 …                     — сколько учеников
import { createRequire } from "node:module";
import { watchToken } from "../../shared/src/watch.ts";
const WebSocket = createRequire(import.meta.url)("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rnd = (a, b) => a + Math.random() * (b - a);

const BASE = process.env.CODEARENA_SERVER ?? "http://127.0.0.1:8787";
const WS_BASE = BASE.replace(/^http/, "ws");
const N = Number(process.env.CODEARENA_LOAD_N ?? 30);
const NAMES = ["Айбек", "Нурай", "Тимур", "Алия", "Данияр", "Эльдияр", "Асель", "Бекзат", "Жибек", "Канат", "Мээрим", "Нурлан", "Айпери", "Санжар", "Толгонай", "Улан", "Чолпон", "Эрмек", "Айгерим", "Бакыт", "Гульзат", "Дастан", "Жанара", "Исмаил", "Каныкей", "Медер", "Назира", "Рустам", "Сезим", "Таалай", "Урмат", "Феруза", "Чынгыз", "Шайыр", "Эльмира", "Юсуп", "Акылай", "Бектур", "Венера", "Гулина"];

const stats = {};
const add = (k, v) => (stats[k] ??= []).push(v);
const errors = {};
const err = (k) => (errors[k] = (errors[k] ?? 0) + 1);
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

/** Подключение с очередью и подписчиками. */
function conn(q) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(`${WS_BASE}/rooms/${room.code}/ws${q}`, { perMessageDeflate: false });
    const c = { ws, handlers: [], sent: 0, got: 0, send: (m) => { if (ws.readyState === 1) { c.sent++; ws.send(JSON.stringify(m)); } } };
    ws.on("message", (d) => { c.got++; const m = JSON.parse(d); if (m.type === "error") { if (m.code === "no_game") c.late = (c.late ?? 0) + 1; else if (!["already_answered", "unknown_task", "locked"].includes(m.code)) err("server error: " + m.code); } for (const h of c.handlers) h(m); });
    ws.on("open", () => res(c));
    ws.on("unexpected-response", (_, r) => rej(new Error("HTTP " + r.statusCode)));
    ws.on("error", (e) => rej(e));
    ws.on("close", () => { if (!c.closing) err("socket closed unexpectedly"); });
  });
}
const on = (c, fn) => c.handlers.push(fn);
const waitFor = async (what, fn, ms = 20000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error("timeout: " + what); await sleep(20); } };

const room = await (await fetch(`${BASE}/rooms`, { method: "POST" })).json();
console.log(`server ${BASE} · room ${room.code} · ${N} students`);
const teacher = await conn(`?teacher=${room.teacherToken}`);
const phone = await conn(`?watch=${await watchToken(room.teacherToken)}`);
const T = { lobby: null, lesson: null, feed: [], state: null, over: false, reveal: null };
on(teacher, (m) => {
  if (m.type === "lobby") T.lobby = m;
  if (m.type === "lesson_state") T.lesson = m;
  if (m.type === "teacher_feed" && m.event.kind === "submission") T.feed.push({ ...m.event, got: Date.now() });
  if (m.type === "state") T.state = m.state;
  if (m.type === "game_over") T.over = true;
  if (m.type === "reveal") T.reveal = m;
});

/* ── 1. Все входят разом ── */
const students = [];
const t0 = Date.now();
await Promise.all(Array.from({ length: N }, async (_, i) => {
  await sleep(rnd(0, 1500)); // «открыли ссылку» почти одновременно
  const start = Date.now();
  const exists = await fetch(`${BASE}/rooms/${room.code}`).then((r) => r.status);
  if (exists !== 200) err("exists check HTTP " + exists);
  const s = await conn("");
  s.name = `${NAMES[i % NAMES.length]} ${String.fromCharCode(1040 + (i % 28))}.`;
  s.handlers.push((m) => { if (m.type === "joined") { s.id = m.playerId; add("join: open link → in the room", Date.now() - start); } });
  s.send({ type: "join", name: s.name });
  students.push(s);
}));
await waitFor("everyone joined", () => students.every((s) => s.id));
await waitFor("teacher sees everyone", () => T.lobby?.players.length === N);
add("join: whole class in the teacher's list", Date.now() - t0);
console.log(`✓ ${N} joined; teacher lobby shows ${T.lobby.players.length}`);

/* ── 2. Урок ── */
// Ученик-бот: отвечает на «покажи код», получает подсказки, считает задержки показа файла.
for (const s of students) {
  s.code = "<!doctype html>\n<html>\n<body>\n  <h1>" + s.name + "</h1>\n</body>\n</html>\n";
  // Базовый обработчик на всю сессию: отвечать на «покажи код».
  s.base = (m) => { if (m.type === "peek_request") s.send({ type: "peek_reply", fileName: "index.html", text: s.code }); };
  s.handlers = [s.base];
  on(s, (m) => {
    if (m.type === "lesson_share") { const ts = Number(m.text.match(/ts:(\d+)/)?.[1]); if (ts) add("lesson: teacher's file → student screen", Date.now() - ts); }
    if (m.type === "checkpoint") s.checkpoint = m.checkpoint;
    if (m.type === "hint" && s.hintAt) { add("lesson: hint from the phone → student", Date.now() - s.hintAt); s.hintAt = 0; }
  });
}
teacher.send({ type: "checkpoint_set", fileName: "index.html", code: "<!doctype html>\n<html>\n<body>\n</body>\n</html>\n" });
await waitFor("checkpoint", () => students.every((s) => s.checkpoint === 1));
// Прогресс: учитель видит изменение у себя — меряем, когда.
const progSent = new Map();
on(teacher, (m) => {
  if (m.type !== "lesson_state") return;
  for (const [id, p] of Object.entries(m.progress ?? {})) {
    const k = id + ":" + p;
    if (progSent.has(k)) { add("lesson: student progress → teacher", Date.now() - progSent.get(k)); progSent.delete(k); }
  }
});
const peekAt = new Map();
on(phone, (m) => { if (m.type === "peek_code" && peekAt.has(m.playerId)) { add("phone: tap student → sees code", Date.now() - peekAt.get(m.playerId)); peekAt.delete(m.playerId); } });
const LESSON_MS = process.env.CODEARENA_LOAD_ONLY ? 3000 : 30000;
const lessonEnd = Date.now() + LESSON_MS;
const loops = [
  // Учитель печатает в показываемом файле — пачки раз в 400 мс.
  (async () => { let i = 0; while (Date.now() < lessonEnd) { teacher.send({ type: "lesson_share", fileName: "index.html", lang: "html", text: `<!-- ts:${Date.now()} -->\n<h1>Урок ${i++}</h1>\n` + "<p>строка</p>\n".repeat(40), line: i % 40 }); await sleep(400); } })(),
  // Телефон: каждые 3 с открывает код случайного ученика, иногда оставляет подсказку.
  (async () => { while (Date.now() < lessonEnd) { const s = students[Math.floor(Math.random() * N)]; peekAt.set(s.id, Date.now()); phone.send({ type: "peek", playerId: s.id }); if (Math.random() < 0.5) { await sleep(500); s.hintAt = Date.now(); phone.send({ type: "hint", playerId: s.id, line: 4, text: "проверь заголовок" }); } await sleep(3000); } })(),
  // Ученики печатают: прогресс не чаще раза в 2 с (как расширение), иногда статус и «объясните».
  ...students.map(async (s, i) => {
    let p = 0;
    await sleep(rnd(0, 2000));
    while (Date.now() < lessonEnd) {
      p = Math.min(100, p + Math.ceil(rnd(1, 6)));
      progSent.set(s.id + ":" + p, Date.now());
      s.send({ type: "progress", checkpoint: 1, percent: p });
      if (p === 100) s.send({ type: "status", status: "done" });
      else if (Math.random() < 0.05) s.send({ type: "status", status: i % 3 ? "writing" : "lost" });
      if (Math.random() < 0.02) s.send({ type: "confused" });
      await sleep(rnd(2000, 3000));
    }
  }),
];
await Promise.all(loops);
await sleep(1000);
console.log(`✓ lesson ${LESSON_MS / 1000}s: teacher sees ${Object.keys(T.lesson.progress).length}/${N} progress, ${Object.values(T.lesson.statuses).filter((x) => x === "done").length} done`);

/* ── 3. Викторина: 5 вопросов, все отвечают за 0.3–3 с ── */
async function quiz() {
  const tasks = Array.from({ length: 5 }, (_, i) => ({ type: "choice", topic: "t", prompt: `Вопрос ${i + 1}?`, options: ["да", "нет", "может", "не знаю"], correct: 0 }));
  T.over = false;
  let taskSentAt = 0;
  const answered = [];
  for (const s of students) {
    s.handlers = [s.base];
    on(s, (m) => {
      if (m.type === "task") {
        add("quiz: question → on screen", Date.now() - taskSentAt);
        setTimeout(() => { s.ansAt = Date.now(); s.send({ type: "submit", taskId: m.taskId, answer: Math.random() < 0.8 ? 0 : 1 }); }, rnd(300, 3000));
      }
      if (m.type === "answered") { add("quiz: answer → «accepted»", Date.now() - s.ansAt); answered.push(1); }
    });
  }
  teacher.send({ type: "start_game", game: "quiz", settings: { questionSec: 20 }, tasks });
  await waitFor("quiz started", () => T.state?.game === "quiz");
  for (let q = 0; q < tasks.length; q++) {
    taskSentAt = Date.now();
    T.reveal = null;
    teacher.send({ type: "next" });
    const before = answered.length;
    await waitFor(`all answered q${q + 1}`, () => answered.length - before === N, 25000);
    await waitFor(`reveal q${q + 1}`, () => T.reveal && T.state?.phase === "reveal", 10000);
    if (T.state.answered !== N) err(`quiz: teacher counted ${T.state.answered}/${N}`);
    await sleep(800);
  }
  teacher.send({ type: "next" });
  await waitFor("quiz over", () => T.over);
  teacher.send({ type: "reset_game" });
  console.log(`✓ quiz: 5 questions × ${N} answers, all accepted`);
}

/* ── 4. Канат: 2 команды тянут наперегонки ── */
async function tug() {
  const assignment = Object.fromEntries(students.map((s, i) => [s.id, i % 2]));
  teacher.send({ type: "set_teams", mode: "teams2", assignment });
  await waitFor("teams", () => T.lobby.mode === "teams2" && T.lobby.players.every((p) => p.team !== null));
  const tasks = Array.from({ length: 12 }, (_, i) => ({ type: "short_answer", topic: "t", prompt: `${i} + ${i} = ?`, answers: [String(i * 2)] }));
  T.over = false;
  let results = 0;
  for (const s of students) {
    s.handlers = [s.base];
    on(s, (m) => {
      if (m.type === "task") {
        s.task = m.taskId;
        const i = Number(m.task.prompt.split(" ")[0]);
        s.right = String(i * 2);
        setTimeout(() => { if (s.task !== m.taskId) return; s.subAt = Date.now(); s.send({ type: "submit", taskId: m.taskId, answer: Math.random() < 0.85 ? s.right : "0" }); }, rnd(1200, 4000));
      }
      if (m.type === "result") {
        add("tug: answer → result", Date.now() - s.subAt); results++;
        // Ошибся — блокировка 2 с, потом пробует снова то же задание.
        if (!m.correct) setTimeout(() => { if (s.task !== m.taskId || T.over) return; s.subAt = Date.now(); s.send({ type: "submit", taskId: m.taskId, answer: s.right }); }, 2300);
      }
      if (m.type === "state" && m.state.lastPull?.playerId === s.id && s.lastPullAt !== m.state.lastPull.at) { s.lastPullAt = m.state.lastPull.at; add("tug: my pull → rope moves", Date.now() - s.subAt); }
    });
  }
  teacher.send({ type: "start_game", game: "tug", settings: { roundSec: 25, wrongLockSec: 2 }, tasks });
  await waitFor("tug started", () => T.state?.game === "tug");
  teacher.send({ type: "next" });
  await waitFor("tug over", () => T.over, 40000);
  teacher.send({ type: "reset_game" });
  teacher.send({ type: "set_teams", mode: "solo", assignment: {} });
  console.log(`✓ tug: ${results} answers checked, rope ${T.state.rope}`);
}

/* ── 5. Codewars: все сдают код за 2–8 с ── */
async function codewars() {
  T.over = false;
  T.feed = [];
  for (const s of students) {
    s.handlers = [s.base];
    on(s, (m) => {
      if (m.type === "task") setTimeout(() => {
        s.subAt = Date.now();
        s.send({ type: "submit", taskId: m.taskId, code: `def evens(nums):\n    # ${s.name}\n    return [n for n in nums if n % 2 == 0]\n`, report: { passed: 2, total: 2, failures: [] } });
      }, rnd(2000, 8000));
      if (m.type === "reveal") s.revealAt = Date.now();
    });
  }
  teacher.send({ type: "start_game", game: "codewars", settings: {}, tasks: [{ type: "code", topic: "t", language: "python", prompt: "Чётные", starter: "def evens(nums):\n    pass",
    tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }], timeLimitSec: 60 }] });
  await waitFor("codewars started", () => T.state?.game === "codewars");
  teacher.send({ type: "next" });
  await waitFor("all solutions at the teacher", () => T.feed.length === N, 20000);
  for (const f of T.feed) { const s = students.find((x) => x.id === f.playerId); add("codewars: submit → teacher sees solution", f.got - s.subAt); }
  // Все решили — решения показываются сами, без таймера.
  await waitFor("solutions shown to all", () => students.every((s) => s.revealAt), 10000);
  const lastSub = Math.max(...students.map((s) => s.subAt));
  for (const s of students) add("codewars: last solution → all solutions shown", s.revealAt - lastSub);
  teacher.send({ type: "next" });
  await waitFor("codewars over", () => T.over);
  teacher.send({ type: "reset_game" });
  console.log(`✓ codewars: ${T.feed.length} solutions, shown to everyone`);
}

/* ── 6. Гонка: у каждого своя очередь заданий ── */
async function race() {
  T.over = false;
  const tasks = Array.from({ length: 10 }, (_, i) => ({ type: "short_answer", topic: "t", prompt: `${i} * 3 = ?`, answers: [String(i * 3)] }));
  let steps = 0;
  let skew = 0;
  for (const s of students) {
    s.handlers = [s.base];
    s.subAt = 0; // первое задание гонки — без ответа перед ним
    on(s, (m) => {
      if (m.type === "state") skew = m.state.serverNow - Date.now();
      if (m.type === "task") {
        if (s.subAt) { const d = Date.now() - s.subAt; add("race: answer → next task", d); if (d > 1000 && process.env.CODEARENA_LOAD_DEBUG) console.log("slow race step", { d, wrong: s.wrongs, id: s.id.slice(0, 4), task: m.taskId, prev: s.task }); }
        s.wrongs = 0;
        const i = Number(m.task.prompt.split(" ")[0]);
        s.task = m.taskId; s.right = String(i * 3);
        setTimeout(() => { s.subAt = Date.now(); s.send({ type: "submit", taskId: m.taskId, answer: Math.random() < 0.85 ? s.right : "1" }); steps++; }, rnd(800, 2500));
      }
      // Ошиблся — ждёт конца блокировки (как ученик видит таймер) и отвечает снова.
      if (m.type === "result" && !m.correct) s.wrongs = (s.wrongs ?? 0) + 1;
      if (m.type === "result" && !m.correct) setTimeout(() => { s.subAt = Date.now(); s.send({ type: "submit", taskId: s.task, answer: s.right }); steps++; }, (m.lockedUntil ? Math.max(0, m.lockedUntil - (Date.now() + skew)) : 0) + rnd(200, 800));
    });
  }
  teacher.send({ type: "start_game", game: "race", settings: { roundSec: 25, raceLength: 10 }, tasks });
  await waitFor("race started", () => T.state?.game === "race");
  teacher.send({ type: "next" });
  await waitFor("race over", () => T.over, 40000);
  teacher.send({ type: "reset_game" });
  console.log(`✓ race: ${steps} answers`);
}

const ONLY = process.env.CODEARENA_LOAD_ONLY;
for (const [name, fn] of [["quiz", quiz], ["tug", tug], ["codewars", codewars], ["race", race]].filter(([n]) => !ONLY || n === ONLY)) {
  try { await fn(); } catch (e) { err(`${name}: ${e.message}`); console.log(`✗ ${name}: ${e.message}`); }
  await sleep(1500);
}

/* ── Итог ── */
for (const c of [teacher, phone, ...students]) { c.closing = true; c.ws.close(); }
teacher.closing = true;
const rows = Object.entries(stats).map(([k, v]) => ({ k, n: v.length, p50: pct(v, 50), p95: pct(v, 95), max: Math.max(...v) }));
console.log("\n" + "what".padEnd(48) + "count".padStart(7) + "p50 ms".padStart(9) + "p95 ms".padStart(9) + "max ms".padStart(9));
for (const r of rows) console.log(r.k.padEnd(48) + String(r.n).padStart(7) + String(r.p50).padStart(9) + String(r.p95).padStart(9) + String(r.max).padStart(9));
const msgs = [teacher, phone, ...students].reduce((a, c) => ({ sent: a.sent + c.sent, got: a.got + c.got }), { sent: 0, got: 0 });
console.log(`\nmessages: clients sent ${msgs.sent}, received ${msgs.got}`);
console.log("late answers after a game ended (bots' timers, not an error):", students.reduce((a, s) => a + (s.late ?? 0), 0));
console.log("errors:", Object.keys(errors).length ? JSON.stringify(errors) : "none");
process.exit(Object.keys(errors).length ? 1 : 0);
