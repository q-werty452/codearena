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
  // Dart: файл задачи .dart, проверка через dart ученика.
  dartcw: {
    game: "codewars",
    settings: NO_PASTE_GUARD,
    tasks: [{ type: "code", topic: "t", language: "dart", prompt: "Верни список только чётных чисел из nums.",
      starter: "List<int> evens(List<int> nums) {\n  return [];\n}", tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }] }],
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
const OFFLINE = SCENARIO === "mytasks" || SCENARIO === "teacherui"; // без бота-учителя
const { code, teacherToken } = OFFLINE ? { code: "", teacherToken: "" } : await (await fetch(`http://${server}/rooms`, { method: "POST" })).json();
console.log("scenario", SCENARIO, "room", code);
const feed = [];
const t = OFFLINE ? new (require("node:events"))() : new WebSocket(`ws://${server}/rooms/${code}/ws?teacher=${teacherToken}`);
if (OFFLINE) t.close = () => {};

// Поддельный Gemini для сценария mytasks: список моделей + generateContent по смыслу промпта.
const gemini = { calls: [], keyInUrl: false };
let geminiUrl = "";
if (SCENARIO === "mytasks") {
  const http = await import("node:http");
  const reply = (res, status, obj) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
  const js = (name, starter, solution) => ({ type: "code", topic: "Массивы", language: "javascript", prompt: name, starter, tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }], solution });
  const GOOD = "function evens(nums) { return nums.filter((n) => n % 2 === 0); }";
  const srv = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      if (/key=/.test(req.url)) gemini.keyInUrl = true;
      const key = req.headers["x-goog-api-key"];
      gemini.calls.push({ path: req.url.split("?")[0], key: key ? "set" : "missing" });
      if (key !== "test-key-1234567890abcdef") return reply(res, 400, { error: { code: 400, message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } });
      if (req.method === "GET") return reply(res, 200, { models: ["gemini-3.6-flash", "gemini-3.10-flash-lite", "gemini-4-flash-preview", "gemini-2.5-flash"].map((n) => ({ name: "models/" + n, supportedGenerationMethods: ["generateContent"] })) });
      const prompt = JSON.parse(body).contents[0].parts[0].text;
      let out;
      if (prompt.includes("failed automatic verification"))
        out = { title: "", tasks: [js("Чётные (исправлено)", "function evens(nums) {\n}", GOOD), js("Заготовка решает", GOOD, GOOD)] };
      else if (prompt.includes("Convert EVERY question"))
        out = { title: "Конспект", tasks: [
          { type: "choice", topic: "Flexbox", prompt: "Какое свойство включает flex?", options: ["display", "float"], correct: 0 },
          { type: "choice", topic: "Flexbox", prompt: "Ось justify-content?", options: ["главная", "поперечная"], correct: 0 },
          { type: "short_answer", topic: "Flexbox", prompt: "Свойство отступа между элементами", answers: ["gap"] } ] };
      else
        out = { title: "Массивы: filter", tasks: [
          js("Чётные", "function evens(nums) {\n}", GOOD),
          js("Чётные (эталон с ошибкой)", "function evens(nums) {\n}", "function evens(nums) { return nums; }"),
          js("Заготовка решает", GOOD, GOOD) ] };
      reply(res, 200, { candidates: [{ content: { parts: [{ text: JSON.stringify(out) }] }, finishReason: "STOP" }] });
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  geminiUrl = `http://127.0.0.1:${srv.address().port}`;
  srv.unref();
}
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
      if (statuses.includes("lost") && !teacherSaw.includes("lost")) teacherSaw.push("lost");
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
// teacherui: VS Code с портом отладки, клики в webview делает e2e/ui-driver.mjs.
const debugPort = 9300 + Math.floor(Math.random() * 600);
let uiResult = null;
if (SCENARIO === "teacherui") {
  // Подстраховка: если ссылка всё же дойдёт до системы, «xdg-open» только запишет адрес.
  const fakeBin = join(tmp, "bin");
  mkdirSync(fakeBin, { recursive: true });
  writeFileSync(join(fakeBin, "xdg-open"), `#!/bin/sh\necho "$@" >> "${handoff}.xdg"\n`, { mode: 0o755 });
  process.env.PATH = fakeBin + ":" + process.env.PATH;
  const { drive } = await import("./ui-driver.mjs");
  const { existsSync } = await import("node:fs");
  void (async () => {
    while (!existsSync(handoff)) await new Promise((r) => setTimeout(r, 300));
    await new Promise((r) => setTimeout(r, 2500));
    uiResult = await drive(debugPort, handoff).catch((e) => ({ ok: false, results: [String(e)] }));
    // Окошко учителя над значком (снимок).
    const { hoverBar } = await import("./hover-driver.mjs");
    const hv = await hoverBar(debugPort, { shot: join(process.env.CODEARENA_E2E_SHOTS || tmp, "statusbar-teacher.png") }).catch((e) => ({ ok: false, results: [String(e)] }));
    uiResult = { ok: uiResult.ok && hv.ok, results: [...uiResult.results, ...hv.results.map((r) => "statusbar: " + r)] };
    writeFileSync(handoff + ".done", "x");
  })();
}
// lesson: окошко над значком в строке состояния — ученик жмёт «Не понял», потом клик по значку.
let hoverResult = null;
const SHOTS = process.env.CODEARENA_E2E_SHOTS || tmp;
if (SCENARIO === "lesson") {
  const { hoverBar } = await import("./hover-driver.mjs");
  const { existsSync } = await import("node:fs");
  void (async () => {
    while (!existsSync(handoff + ".hover")) await new Promise((r) => setTimeout(r, 300));
    hoverResult = await hoverBar(debugPort, { click: "codearena.status.lost", shot: join(SHOTS, "statusbar-student.png"), openSidebar: true }).catch((e) => ({ ok: false, results: [String(e)] }));
    writeFileSync(handoff + ".hover.done", "x");
  })();
}
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
writeFileSync(join(tmp, "user", "User", "settings.json"), JSON.stringify({ "codearena.serverUrl": `http://${server}`, ...(geminiUrl ? { "codearena.ai.endpoint": geminiUrl } : {}) }));
// Файлы учителя для сценария mytasks.
writeFileSync(join(tmp, "notes.txt"), "Сегодня прошли flexbox. Свойство display: flex включает flex-раскладку, gap задаёт отступы.\nВопросы к уроку: какое свойство включает flex? чем задают отступ?");
const out = join(tmp, "result.json");
let failed = false;
try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH ?? "/usr/share/code/code",
    extensionDevelopmentPath: resolve(here, ".."),
    extensionTestsPath: resolve(here, "suite.cjs"),
    launchArgs: [...(LIVE ? [wsDir] : []), ...(SCENARIO === "teacherui" || SCENARIO === "lesson" ? [`--remote-debugging-port=${debugPort}`] : []), "--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "ext"), "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-extensions"],
    extensionTestsEnv: { CODEARENA_E2E_TMP: tmp, CODEARENA_E2E_FIXTURES: resolve(here, "..", "src", "__fixtures__"), CODEARENA_E2E_CODE: code, CODEARENA_E2E_OUT: out, CODEARENA_E2E_SCENARIO: SCENARIO, CODEARENA_E2E_HANDOFF: handoff },
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
} else if (SCENARIO === "teacherui") {
  console.log((uiResult?.results ?? ["driver did not run"]).map((r) => "  ▸ " + r).join("\n"));
  liveOk = uiResult?.ok === true;
} else if (SCENARIO === "mytasks") {
  console.log("gemini calls:", gemini.calls.map((c) => `${c.path} (key ${c.key})`).join(", "), "| key in URL:", gemini.keyInUrl);
  liveOk = !gemini.keyInUrl && gemini.calls.some((c) => c.path.includes("gemini-3.6-flash:generateContent"));
} else if (SCENARIO === "lesson") {
  console.log("teacher saw:", teacherSaw.join(", "));
  console.log((hoverResult?.results ?? ["hover driver did not run"]).map((r) => "  ▸ " + r).join("\n"));
  liveOk = hoverResult?.ok === true && teacherSaw.includes("lost");
}
else if (SCENARIO === "anticheat") console.log("teacher saw flags:", JSON.stringify(Object.values(lastFlags)[0] ?? {}));
else console.log("teacher saw:", feed.map((f) => `${f.correct ? "✓" : "✗"} ${f.report?.passed}/${f.report?.total}`).join(", "));
t.close();
// VS Code оставляет «dconf watch» с унаследованным портом отладки — убираем только его.
if (SCENARIO === "teacherui" || SCENARIO === "lesson") {
  const { execSync } = await import("node:child_process");
  try {
    for (const m of execSync("ss -ltnp", { encoding: "utf8" }).matchAll(new RegExp(`:${debugPort}\\s.*"dconf",pid=(\\d+)`, "g"))) {
      const pid = Number(m[1]);
      if (execSync(`ps -o args= -p ${pid}`, { encoding: "utf8" }).startsWith("dconf watch")) process.kill(pid);
    }
  } catch {}
}
if (!liveOk) console.log("LIVE CHECK FAILED");
process.exit(failed || !res.ok || !liveOk ? 1 : 0);
