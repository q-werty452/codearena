// Сквозной тест Codewars: бот-учитель + настоящий VS Code с расширением.
// Нужен запущенный сервер: npm run dev:server. Запуск: node e2e/run.mjs
import { runTests } from "@vscode/test-electron";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const here = resolve(import.meta.dirname);
const server = "127.0.0.1:8787";

// Сценарии: codewars (Python) и fixbug («Найди баг» → «Исправь баг» на HTML).
const SCENARIO = process.argv[2] ?? "codewars";
// Сценарии вставляют решение целиком — анти-чит вставок в них выключен (кроме сценария anticheat).
const NO_PASTE_GUARD = { antiCheat: { pasteBlock: false, bigInsertDetect: false } };
const GAMES = {
  anticheat: {
    game: "codewars",
    tasks: [{ type: "code", topic: "t", language: "python", prompt: "Верни список только чётных чисел из nums.",
      starter: "def evens(nums):\n    pass", tests: [{ call: "evens([2])", expected: "[2]" }] }],
  },
  codewars: {
    game: "codewars",
    settings: NO_PASTE_GUARD,
    tasks: [{ type: "code", topic: "t", language: "python", prompt: "Верни список только чётных чисел из nums.",
      starter: "def evens(nums):\n    pass", tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }] }],
  },
  lesson: { game: "quiz", tasks: [] },
  fixbug: {
    game: "bug",
    settings: NO_PASTE_GUARD,
    tasks: [{ type: "fix_bug", topic: "HTML", language: "html", timeLimitSec: 120, prompt: "Замени div на семантический тег.",
      code: '<div class="footer">© 2026</div>', rules: [{ selector: "footer", label: "есть footer" }, { selector: "div.footer", exists: false, label: "нет div.footer" }] }],
  },
};
// Эталон урока для сценариев livestudent / liveteacher.
const REF = "<!doctype html>\n<html>\n<head>\n  <title>Урок</title>\n</head>\n<body>\n  <h1>Привет</h1>\n  <p>Абзац</p>\n  <ul>\n    <li>Один</li>\n    <li>Два</li>\n  </ul>\n</body>\n</html>\n";
const LIVE = SCENARIO === "livestudent" || SCENARIO === "liveteacher";
const { code, teacherToken } = await (await fetch(`http://${server}/rooms`, { method: "POST" })).json();
console.log("scenario", SCENARIO, "room", code);
const feed = [];
const t = new WebSocket(`ws://${server}/rooms/${code}/ws?teacher=${teacherToken}`);
let started = false;
let lastFlags = {};
const teacherSaw = [];
const live = { progress: [], peek: null, shares: 0, shareTexts: [], checkpoint: null, off: false };
let sentPeek = false;
t.on("message", (d) => {
  const m = JSON.parse(d);
  if (SCENARIO === "livestudent") {
    // Бот-учитель: показывает файл, ставит чекпоинт, ждёт 100 %, смотрит код, двигает курсор.
    if (m.type === "lobby" && !started && m.players.some((p) => p.name === "E2E Student")) {
      started = true;
      t.send(JSON.stringify({ type: "lesson_share", fileName: "index.html", lang: "html", text: REF, line: 2 }));
      setTimeout(() => t.send(JSON.stringify({ type: "checkpoint_set", code: REF, fileName: "index.html" })), 300);
    }
    if (m.type === "lesson_state") {
      for (const [id, p] of Object.entries(m.progress ?? {})) {
        if (live.progress.at(-1) !== p) live.progress.push(p);
        if (p === 100 && !sentPeek) {
          sentPeek = true;
          t.send(JSON.stringify({ type: "peek", playerId: id }));
          t.send(JSON.stringify({ type: "lesson_share", fileName: "index.html", lang: "html", text: REF, line: 10 }));
        }
      }
    }
    if (m.type === "peek_code") live.peek = { name: m.name, fileName: m.fileName, hasCode: m.text.includes("<li>Два</li>") };
    return;
  }
  if (SCENARIO === "lesson") {
    // Бот-учитель: ждёт «готово» и анонимное «объясните», запускает игру, закрывает итоги.
    if (m.type === "lesson_state") {
      const statuses = Object.values(m.statuses);
      if (statuses.includes("done") && !teacherSaw.includes("done")) teacherSaw.push("done");
      if (m.confused === 1 && !teacherSaw.includes("confused=1")) {
        teacherSaw.push("confused=1");
        if (JSON.stringify(m).includes("E2E")) teacherSaw.push("LEAK: name in lesson_state");
        t.send(JSON.stringify({ type: "start_game", game: "quiz", settings: {}, tasks: [{ type: "choice", topic: "t", prompt: "?", options: ["a", "b"], correct: 0 }] }));
        setTimeout(() => t.send(JSON.stringify({ type: "end_game" })), 2500);
        setTimeout(() => t.send(JSON.stringify({ type: "reset_game" })), 4000);
      }
    }
    return;
  }
  if (m.type === "lobby" && !started && m.players.some((p) => p.name === "E2E Student")) {
    started = true;
    t.send(JSON.stringify({ type: "start_game", settings: {}, ...GAMES[SCENARIO] }));
    setTimeout(() => t.send(JSON.stringify({ type: "next" })), 500); // без отсчёта
  }
  if (m.type === "flags") lastFlags = m.flags;
  if (m.type === "teacher_feed" && m.event.kind === "submission") feed.push({ correct: m.event.correct, code: m.event.code, report: m.event.report });
});

const tmp = mkdtempSync(join(tmpdir(), "codearena-e2e-"));
// Папка проекта ученика/учителя: site/index.html.
const wsDir = join(tmp, "ws");
mkdirSync(join(wsDir, "site"), { recursive: true });
writeFileSync(join(wsDir, "site", "index.html"), SCENARIO === "liveteacher" ? REF : "<!doctype html>\n<html>\n<head>\n  <title>Урок</title>\n</head>\n<body>\n</body>\n</html>\n");
const handoff = join(tmp, "room.txt");
// liveteacher: комнату создаёт VS Code, бот-ученик подключается по коду из handoff-файла.
let bot = null;
if (SCENARIO === "liveteacher") {
  const poll = setInterval(() => {
    let room;
    try { room = readFileSync(handoff, "utf8").trim(); } catch { return; }
    clearInterval(poll);
    bot = new WebSocket(`ws://${server}/rooms/${room}/ws`);
    bot.on("open", () => bot.send(JSON.stringify({ type: "join", name: "Bot" })));
    bot.on("message", (d) => {
      const m = JSON.parse(d);
      if (m.type === "lesson_share") { live.shares++; live.shareTexts.push(m.text); }
      if (m.type === "lesson_share_off") live.off = true;
      if (m.type === "checkpoint") {
        live.checkpoint = { n: m.checkpoint, fileName: m.fileName, sameAsShare: m.code === live.shareTexts.at(-1) };
        bot.send(JSON.stringify({ type: "progress", checkpoint: m.checkpoint, percent: 40 }));
      }
      if (m.type === "peek_request") bot.send(JSON.stringify({ type: "peek_reply", fileName: "index.html", text: "<p>BOT CODE</p>" }));
    });
  }, 200);
}
// Тесты ходят на локальный сервер, а не на публичный.
mkdirSync(join(tmp, "user", "User"), { recursive: true });
writeFileSync(join(tmp, "user", "User", "settings.json"), JSON.stringify({ "codearena.serverUrl": `http://${server}` }));
const out = join(tmp, "result.json");
let failed = false;
try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH ?? "/usr/share/code/code",
    extensionDevelopmentPath: resolve(here, ".."),
    extensionTestsPath: resolve(here, "suite.cjs"),
    launchArgs: [...(LIVE ? [wsDir] : []), "--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "ext"), "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-extensions"],
    extensionTestsEnv: { CODEARENA_E2E_CODE: code, CODEARENA_E2E_OUT: out, CODEARENA_E2E_SCENARIO: SCENARIO, CODEARENA_E2E_HANDOFF: handoff },
  });
} catch {
  failed = true;
}
const res = JSON.parse(readFileSync(out, "utf8"));
console.log(res.log.map((l) => "  · " + l).join("\n"));
let liveOk = true;
if (SCENARIO === "livestudent") {
  console.log("teacher saw progress:", live.progress.join(" → "), "| peek:", JSON.stringify(live.peek));
  liveOk = live.progress.length >= 2 && live.progress[0] < 100 && live.progress.at(-1) === 100 && live.peek?.hasCode === true && live.peek.fileName === "index.html";
} else if (SCENARIO === "liveteacher") {
  const last = live.shareTexts.at(-1) ?? "";
  console.log(`bot student got ${live.shares} lesson_share message(s) for 10 keystrokes; last has all edits: ${last.includes("<!-- 0123456789 -->")}; checkpoint: ${JSON.stringify(live.checkpoint)}; share stopped: ${live.off}`);
  liveOk = live.shares >= 2 && live.shares <= 6 && last.includes("<!-- 0123456789 -->") && live.checkpoint?.n === 1 && live.checkpoint.sameAsShare && live.off;
  bot?.close();
} else if (SCENARIO === "lesson") console.log("teacher saw:", teacherSaw.join(", "));
else if (SCENARIO === "anticheat") console.log("teacher saw flags:", JSON.stringify(Object.values(lastFlags)[0] ?? {}));
else console.log("teacher saw:", feed.map((f) => `${f.correct ? "✓" : "✗"} ${f.report?.passed}/${f.report?.total}`).join(", "));
t.close();
if (!liveOk) console.log("LIVE CHECK FAILED");
process.exit(failed || !res.ok || !liveOk ? 1 : 0);
