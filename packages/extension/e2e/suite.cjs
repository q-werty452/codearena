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

    // Учитель запускает Codewars — расширение само открывает файл задачи.
    const editor = await waitFor("task file opened", () =>
      vscode.window.visibleTextEditors.find((e) => /task-1\.py$/.test(e.document.fileName)), 30000);
    const doc = editor.document;
    step("task file opened: " + doc.fileName.split("/").slice(-3).join("/"));
    if (!doc.getText().includes("─── CodeArena ───")) throw new Error("no marker in task file");
    if (!doc.getText().includes("# Верни") && !doc.getText().includes("# Return")) throw new Error("no prompt in header");

    // Панель игры открыта рядом.
    // Панель игры — во второй колонке, файл задачи — в первой.
    await waitFor("panel beside the file", () => {
      const groups = vscode.window.tabGroups.all;
      const panelGroup = groups.find((g) => g.tabs.some((t) => t.label === "CodeArena"));
      const fileGroup = groups.find((g) => g.tabs.some((t) => /task-1\.py/.test(t.label)));
      return panelGroup && fileGroup && panelGroup !== fileGroup;
    }, 10000);
    step("game panel opened beside the editor (" + vscode.window.tabGroups.all.length + " editor groups)");

    // Кнопки над кодом.
    const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
    const titles = (lenses || []).map((l) => l.command && l.command.title).filter(Boolean);
    step("code lenses: " + titles.join(" | "));
    if (!titles.some((t) => /Run tests|Запустить/.test(t))) throw new Error("no Run tests lens");

    // Сначала неправильное решение — тесты должны упасть.
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    const header = doc.getText().split("\n").filter((l, i, a) => i <= a.findIndex((x) => x.includes("─── CodeArena ───"))).join("\n");
    await editor.edit((b) => b.replace(fullRange, header + "\n\ndef evens(nums):\n    return nums\n"));
    await vscode.commands.executeCommand("codearena.runTests");
    const bad = await waitFor("failing run", () => {
      const r = session.snapshot.game && session.snapshot.game.localRun;
      return r && !r.running && r.results.length ? r : null;
    });
    step("wrong solution: " + bad.results.filter((r) => r.ok).length + "/" + bad.results.length + " tests passed");
    if (bad.results.every((r) => r.ok)) throw new Error("wrong solution passed");

    // Правильное решение и отправка (как Ctrl+Enter).
    await editor.edit((b) => b.replace(new vscode.Range(0, 0, doc.lineCount, 0), header + "\n\ndef evens(nums):\n    return [n for n in nums if n % 2 == 0]\n"));
    await vscode.commands.executeCommand("codearena.submitCode");
    const result = await waitFor("server result", () => {
      const g = session.snapshot.game;
      return g && g.result && g.result.correct ? g.result : null;
    });
    step("submitted: server says correct, place #" + result.place);

    const solvedLens = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", doc.uri);
    step("lens after solve: " + (solvedLens || []).map((l) => l.command && l.command.title).join(" | "));
    fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
  } catch (e) {
    step("FAILED: " + (e && e.stack || e));
    fs.writeFileSync(out, JSON.stringify({ ok: false, log }, null, 2));
    throw e;
  }
};
