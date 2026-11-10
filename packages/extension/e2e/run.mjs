// Сквозной тест Codewars: бот-учитель + настоящий VS Code с расширением.
// Нужен запущенный сервер: npm run dev:server. Запуск: node e2e/run.mjs
import { runTests } from "@vscode/test-electron";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const here = resolve(import.meta.dirname);
const server = "127.0.0.1:8787";

const { code, teacherToken } = await (await fetch(`http://${server}/rooms`, { method: "POST" })).json();
console.log("room", code);
const feed = [];
const t = new WebSocket(`ws://${server}/rooms/${code}/ws?teacher=${teacherToken}`);
let started = false;
t.on("message", (d) => {
  const m = JSON.parse(d);
  if (m.type === "lobby" && !started && m.players.some((p) => p.name === "E2E Student")) {
    started = true;
    t.send(JSON.stringify({
      type: "start_game", game: "codewars", settings: {},
      tasks: [{ type: "code", topic: "t", language: "python", prompt: "Верни список только чётных чисел из nums.",
        starter: "def evens(nums):\n    pass", tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }] }],
    }));
    setTimeout(() => t.send(JSON.stringify({ type: "next" })), 500); // без отсчёта
  }
  if (m.type === "teacher_feed" && m.event.kind === "submission") feed.push({ correct: m.event.correct, code: m.event.code, report: m.event.report });
});

const tmp = mkdtempSync(join(tmpdir(), "codearena-e2e-"));
const out = join(tmp, "result.json");
let failed = false;
try {
  await runTests({
    vscodeExecutablePath: process.env.VSCODE_PATH ?? "/usr/share/code/code",
    extensionDevelopmentPath: resolve(here, ".."),
    extensionTestsPath: resolve(here, "suite.cjs"),
    launchArgs: ["--user-data-dir", join(tmp, "user"), "--extensions-dir", join(tmp, "ext"), "--disable-workspace-trust", "--skip-welcome", "--skip-release-notes", "--disable-extensions"],
    extensionTestsEnv: { CODEARENA_E2E_CODE: code, CODEARENA_E2E_OUT: out },
  });
} catch {
  failed = true;
}
const res = JSON.parse(readFileSync(out, "utf8"));
console.log(res.log.map((l) => "  · " + l).join("\n"));
console.log("teacher saw:", feed.map((f) => `${f.correct ? "✓" : "✗"} ${f.report?.passed}/${f.report?.total}`).join(", "));
t.close();
process.exit(failed || !res.ok ? 1 : 0);
