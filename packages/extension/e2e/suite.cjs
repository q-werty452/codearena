// Выполняется ВНУТРИ VS Code (@vscode/test-electron): играет за ученика в Codewars.
const vscode = require("vscode");
const fs = require("node:fs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(what, fn, ms = 20000) {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timeout waiting for " + what);
    await sleep(200);
  }
}

const SCENARIO = process.env.CODEARENA_E2E_SCENARIO || "codewars";
const FILE_RE = SCENARIO === "fixbug" ? /task-1\.html$/ : /task-1\.py$/;

async function antiCheatScenario(session, editor, step) {
  const doc = editor.document;
  const before = doc.getText();
  // 1) Большая вставка одной правкой (как меню «Вставить» или ИИ-автодополнение) — откат.
  const big = "\ndef evens(nums):\n    return [n for n in nums if n % 2 == 0]  # скопировано целиком\n";
  await editor.edit((b) => b.insert(new vscode.Position(doc.lineCount, 0), big));
  await waitFor("big insert reverted", () => doc.getText() === before, 5000);
  step("big insert (" + big.length + " chars) was reverted");
  // 2) Ctrl+V с длинным текстом — не вставляется.
  await vscode.env.clipboard.writeText("x".repeat(80));
  editor.selection = new vscode.Selection(doc.lineCount - 1, 0, doc.lineCount - 1, 0);
  await vscode.commands.executeCommand("codearena.paste");
  await sleep(500);
  step("Ctrl+V with 80 chars: " + (doc.getText() === before ? "blocked" : "PASTED (bug)"));
  if (doc.getText() !== before) throw new Error("long paste went through");
  // 3) Короткий Ctrl+V — проходит.
  await vscode.env.clipboard.writeText("nums");
  await vscode.window.showTextDocument(doc, { viewColumn: editor.viewColumn });
  await vscode.commands.executeCommand("codearena.paste");
  await waitFor("short paste", () => doc.getText().includes("nums") && doc.getText().length === before.length + 4, 5000);
  step("Ctrl+V with 4 chars: pasted");
}
const MARK = "─── CodeArena ───";

async function lessonScenario(session, step) {
  // Урок — режим по умолчанию: сразу после входа статус «пишу».
  await waitFor("lesson_me", () => session.snapshot.lesson && session.snapshot.me);
  step("in lesson right after join, status: " + session.snapshot.lesson.myStatus);
  const ctx = await vscode.commands.executeCommand("getContext", "codearena.inLesson").catch(() => "n/a");
  await vscode.commands.executeCommand("codearena.status.done"); // = Ctrl+Alt+1
  await waitFor("status done", () => session.snapshot.lesson.myStatus === "done");
  step("Ctrl+Alt+1 command → status done");
  await vscode.commands.executeCommand("codearena.status.confused"); // = Ctrl+Alt+4, анонимно
  await waitFor("confused", () => session.snapshot.lesson.iConfused);
  step("Ctrl+Alt+4 command → anonymous «explain again» sent");
  // Учитель запускает викторину поверх урока — у ученика открывается панель игры.
  await waitFor("game panel", () => vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === "CodeArena")), 20000);
  step("teacher started a game → game panel opened");
  // Учитель закрывает итоги — ученик возвращается в урок, панель закрывается сама.
  await waitFor("back to lesson", () => !session.snapshot.game && !vscode.window.tabGroups.all.some((g) => g.tabs.some((t) => t.label === "CodeArena")), 20000);
  step("back to lesson: game panel closed, status kept: " + session.snapshot.lesson.myStatus);
  void ctx;
}

exports.run = async function run() {
  const log = [];
  const step = (s) => { log.push(s); console.log("[e2e] " + s); };
  const out = process.env.CODEARENA_E2E_OUT;
  try {
    const ext = vscode.extensions.getExtension("q-werty452.codearena");
    const api = await ext.activate();
    const session = api.session;

    await session.join(process.env.CODEARENA_E2E_CODE, "E2E Student");
    await waitFor("joined", () => session.snapshot.me);
    step("joined room " + session.snapshot.code);
    if (SCENARIO === "lesson") {
      await lessonScenario(session, step);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }

    // Учитель запускает Codewars — расширение само открывает файл задачи.
    const editor = await waitFor("task file opened", () =>
      vscode.window.visibleTextEditors.find((e) => FILE_RE.test(e.document.fileName)), 30000);
    const doc = editor.document;
    step("task file opened: " + doc.fileName.split("/").slice(-3).join("/"));
    if (!doc.getText().includes("─── CodeArena ───")) throw new Error("no marker in task file");
    if (SCENARIO === "codewars" && !doc.getText().includes("# Верни")) throw new Error("no prompt in header");
    if (SCENARIO === "fixbug" && !doc.getText().startsWith("<!-- CodeArena")) throw new Error("no HTML comment header");

    // Панель игры открыта рядом.
    // Панель игры — во второй колонке, файл задачи — в первой.
    await waitFor("panel beside the file", () => {
      const groups = vscode.window.tabGroups.all;
      const panelGroup = groups.find((g) => g.tabs.some((t) => t.label === "CodeArena"));
      const fileGroup = groups.find((g) => g.tabs.some((t) => FILE_RE.test(t.label)));
      return panelGroup && fileGroup && panelGroup !== fileGroup;
    }, 10000);
    step("game panel opened beside the editor (" + vscode.window.tabGroups.all.length + " editor groups)");

    if (SCENARIO === "anticheat") {
      await antiCheatScenario(session, editor, step);
      await sleep(800); // флаги долетают до учителя
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }

    // Кнопки над кодом.
    const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
    const titles = (lenses || []).map((l) => l.command && l.command.title).filter(Boolean);
    step("code lenses: " + titles.join(" | "));
    if (!titles.some((t) => /Run tests|Запустить/.test(t))) throw new Error("no Run tests lens");

    // Сначала неправильное решение — проверки должны упасть.
    const header = doc.getText().split("\n").filter((l, i, a) => i <= a.findIndex((x) => x.includes(MARK))).join("\n");
    const WRONG = SCENARIO === "fixbug" ? '<div class="footer">© 2026</div>' : "def evens(nums):\n    return nums";
    const RIGHT = SCENARIO === "fixbug" ? "<footer>© 2026</footer>" : "def evens(nums):\n    return [n for n in nums if n % 2 == 0]";
    if (SCENARIO === "fixbug") {
      // Без правок: в файле лежит сломанный код — проверки не проходят.
      step("broken code in file: " + JSON.stringify(doc.getText().split(MARK)[1].split("\n").slice(2, 3).join("")));
    }
    await editor.edit((b) => b.replace(new vscode.Range(0, 0, doc.lineCount, 0), header + "\n\n" + WRONG + "\n"));
    await vscode.commands.executeCommand("codearena.runTests");
    const bad = await waitFor("failing run", () => {
      const r = session.snapshot.game && session.snapshot.game.localRun;
      return r && !r.running && r.results.length ? r : null;
    });
    step("wrong solution: " + bad.results.filter((r) => r.ok).length + "/" + bad.results.length + " checks passed" + (SCENARIO === "fixbug" ? " (" + bad.results.filter((r) => !r.ok).map((r) => r.call + ": " + r.got).join("; ") + ")" : ""));
    if (bad.results.every((r) => r.ok)) throw new Error("wrong solution passed");

    // Правильное решение и отправка (как Ctrl+Enter).
    await editor.edit((b) => b.replace(new vscode.Range(0, 0, doc.lineCount, 0), header + "\n\n" + RIGHT + "\n"));
    await vscode.commands.executeCommand("codearena.submitCode");
    const result = await waitFor("server result", () => {
      const g = session.snapshot.game;
      return g && g.result && g.result.correct ? g.result : null;
    });
    step("submitted: server says correct" + (SCENARIO === "fixbug" ? ", +" + result.points + " points" : ", place #" + result.place));

    const solvedLens = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
    step("lens after solve: " + (solvedLens || []).map((l) => l.command && l.command.title).join(" | "));
    fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
  } catch (e) {
    step("FAILED: " + (e && e.stack || e));
    fs.writeFileSync(out, JSON.stringify({ ok: false, log }, null, 2));
    throw e;
  }
};
