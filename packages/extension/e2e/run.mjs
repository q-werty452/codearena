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
const GAMES = {
  codewars: {
    game: "codewars",
    tasks: [{ type: "code", topic: "t", language: "python", prompt: "Верни список только чётных чисел из nums.",
      starter: "def evens(nums):\n    pass", tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }] }],
  },
  lesson: { game: "quiz", tasks: [] },
  fixbug: {
    game: "bug",
    tasks: [{ type: "fix_bug", topic: "HTML", language: "html", timeLimitSec: 120, prompt: "Замени div на семантический тег.",
      code: '<div class="footer">© 2026</div>', rules: [{ selector: "footer", label: "есть footer" }, { selector: "div.footer", exists: false, label: "нет div.footer" }] }],
  },
};
const { code, teacherToken } = await (await fetch(`http://${server}/rooms`, { method: "POST" })).json();
console.log("scenario", SCENARIO, "room", code);
const feed = [];
const t = new WebSocket(`ws://${server}/rooms/${code}/ws?teacher=${teacherToken}`);
let started = false;
const teacherSaw = [];
t.on("message", (d) => {
  const m = JSON.parse(d);
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
  if (m.type === "teacher_feed" && m.event.kind === "submission") feed.push({ correct: m.event.correct, code: m.event.code, report: m.event.report });
});

const tmp = mkdtempSync(join(tmpdir(), "codearena-e2e-"));
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
    launchArgs: ["--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "ext"), "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-extensions"],
    extensionTestsEnv: { CODEARENA_E2E_CODE: code, CODEARENA_E2E_OUT: out, CODEARENA_E2E_SCENARIO: SCENARIO },
  });
} catch {
  failed = true;
}
const res = JSON.parse(readFileSync(out, "utf8"));
console.log(res.log.map((l) => "  · " + l).join("\n"));
if (SCENARIO === "lesson") console.log("teacher saw:", teacherSaw.join(", "));
else console.log("teacher saw:", feed.map((f) => `${f.correct ? "✓" : "✗"} ${f.report?.passed}/${f.report?.total}`).join(", "));
t.close();
process.exit(failed || !res.ok ? 1 : 0);
