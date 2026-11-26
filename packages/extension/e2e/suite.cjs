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
const FILE_RE = SCENARIO === "fixbug" ? /task-1\.html$/ : SCENARIO === "dartcw" ? /task-1\.dart$/ : /task-1\.py$/;

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
  // Окошко над значком в строке состояния: внешний CDP-скрипт наводит мышь и жмёт «Не понял».
  const h = process.env.CODEARENA_E2E_HANDOFF;
  fs.writeFileSync(h + ".hover", "go");
  await waitFor("status lost via the status bar popup", () => session.snapshot.lesson.myStatus === "lost", 40000);
  step("status bar popup → «lost» clicked, status: " + session.snapshot.lesson.myStatus);
  await waitFor("hover driver done", () => fs.existsSync(h + ".hover.done"), 30000);
  await waitFor("status done via the popup opened by a click", () => session.snapshot.lesson.myStatus === "done", 10000);
  step("click on the icon → popup → «done», status: " + session.snapshot.lesson.myStatus);
  void ctx;
}

const isTeacherDoc = (e) => e.document.uri.scheme === "codearena" && e.document.uri.path.startsWith("/teacher/");

async function liveStudentScenario(session, step, api) {
  // Учитель показал файл — он открылся рядом, только для чтения.
  const ted = await waitFor("teacher file beside", () => vscode.window.visibleTextEditors.find(isTeacherDoc));
  step("teacher file opened beside: " + ted.document.uri.toString() + " (" + ted.document.lineCount + " lines)");
  // Печать с клавиатуры идёт через команду "type" — в файле учителя она ничего не меняет.
  const before = ted.document.getText();
  await vscode.window.showTextDocument(ted.document, { viewColumn: ted.viewColumn, preserveFocus: false });
  await vscode.commands.executeCommand("type", { text: "x" });
  await sleep(300);
  const editable = ted.document.getText() !== before || vscode.workspace.fs.isWritableFileSystem("codearena") !== false;
  step("teacher file read-only (typing blocked, fs not writable): " + !editable);
  if (editable) throw new Error("teacher file is editable");

  // Чекпоинт: файл урока выбран сам (единственный index.html в проекте).
  const myFile = await waitFor("lesson file auto-picked", () => session.snapshot.lesson.myFile);
  step("lesson file auto-selected: " + myFile);
  const first = await waitFor("first progress", () => session.snapshot.lesson.myProgress !== null && session.snapshot.lesson.myProgress);
  step("progress before writing: " + first + "%");
  if (first >= 100) throw new Error("progress already 100");

  // Пишем код как у учителя, но со своими отступами и пустыми строками — должно быть 100 %.
  const uri = vscode.workspace.workspaceFolders[0].uri;
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(uri, "site", "index.html"));
  const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One });
  const mine = "<!doctype html>\n<html>\n<head>\n<title>Урок</title>\n</head>\n\n<body>\n\t<h1>Привет</h1>\n\t<p>Абзац</p>\n\n\t<ul>\n\t\t<li>Один</li>\n\t\t<li>Два</li>\n\t</ul>\n</body>\n</html>\n";
  await ed.edit((b) => b.replace(new vscode.Range(0, 0, doc.lineCount, 0), mine));
  await waitFor("progress 100", () => session.snapshot.lesson.myProgress === 100, 10000);
  step("after typing (different indentation/blank lines): 100%");

  // «Следовать за курсором»: учитель перешёл на строку 11 — у ученика выделена она же.
  await waitFor("follow teacher cursor", () => {
    const t = vscode.window.visibleTextEditors.find(isTeacherDoc);
    return t && t.selection.active.line === 10;
  }, 10000);
  step("follow: teacher moved to line 11, student's view followed");
  await sleep(1500); // ответ на «посмотреть код» долетает до учителя

  // Подсказка учителя на строке 9 — подсвечена у ученика.
  const h1 = await waitFor("hint on line 9", () => api.hints.list().find((h) => h.line === 9 && h.text === "проверь абзац"), 10000);
  step("teacher hint shown: " + JSON.stringify(h1));
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: false });
  await sleep(600);
  fs.writeFileSync(process.env.CODEARENA_E2E_HANDOFF + ".shot", "go");
  await waitFor("student screenshot", () => fs.existsSync(process.env.CODEARENA_E2E_HANDOFF + ".shot.done"), 15000);
  // Выше вставили строку — подсказка едет вместе со своей строкой.
  await ed.edit((b) => b.insert(new vscode.Position(0, 0), "<!-- мой комментарий -->\n"));
  await waitFor("hint moved to line 10", () => api.hints.list().some((h) => h.line === 10), 5000);
  step("line inserted above → hint moved to line 10");
  // Ученик исправил саму строку — подсказка пропала.
  await ed.edit((b) => b.replace(doc.lineAt(9).range, "\t<p>Абзац исправлен</p>"));
  await waitFor("hint gone", () => api.hints.list().length === 0, 5000);
  step("student fixed the line → hint gone");
}

// Слабый Wi-Fi: ответ в момент обрыва не теряется; «зависшее» соединение замечается само.
async function flakyScenario(session, step) {
  const h = process.env.CODEARENA_E2E_HANDOFF;
  const task = await waitFor("question", () => session.snapshot.game?.phase === "playing" && session.snapshot.game.task, 20000);
  step("question on screen; Wi-Fi drops now");
  fs.writeFileSync(h + ".drop", "x");
  await waitFor("connection lost", () => session.snapshot.status !== "online", 10000);
  session.answer(task.id, 0); // ученик жмёт ответ во время обрыва
  step("answered while offline (status: " + session.snapshot.status + ")");
  await waitFor("answer delivered after reconnect", () => session.snapshot.status === "online" && session.snapshot.game?.myAnswer === 0, 30000);
  step("Wi-Fi back → reconnected, the answer reached the server");

  // Зависшее соединение: открыто, но данные не идут.
  await sleep(500);
  fs.writeFileSync(h + ".freeze", "x");
  const t0 = Date.now();
  await waitFor("frozen connection noticed", () => session.snapshot.status !== "online", 60000);
  step("frozen connection noticed after " + Math.round((Date.now() - t0) / 1000) + " s → reconnecting");
  fs.writeFileSync(h + ".thaw", "x");
  await waitFor("online again", () => session.snapshot.status === "online", 30000);
  session.setStatus("lost");
  await sleep(1500);
  step("back online; status «lost» sent");
}

// Учитель ведёт «Найди баг»: отправки учеников (и неверные) и флаги должны дойти до панели учителя.
async function teacherBugScenario(session, step) {
  await session.createRoom();
  await waitFor("room", () => session.snapshot.code && session.snapshot.status === "online");
  fs.writeFileSync(process.env.CODEARENA_E2E_HANDOFF, session.snapshot.code);
  const players = await waitFor("3 bots", () => session.snapshot.lobby?.players.length === 3 && session.snapshot.lobby.players);
  const id = (n) => players.find((p) => p.name === n).id;
  step("teacher room " + session.snapshot.code + ", bots joined");
  session.send({ type: "start_game", game: "bug", settings: {}, tasks: [{ type: "fix_bug", topic: "t", language: "python", prompt: "Исправь: сумма двух чисел.",
    code: "def add(a, b):\n    return a - b", tests: [{ call: "add(2, 3)", expected: "5" }, { call: "add(1, 1)", expected: "2" }], solution: "def add(a, b):\n    return a + b" }] });
  await waitFor("game", () => session.snapshot.game);
  session.send({ type: "next" });
  const subs = await waitFor("both submissions at the teacher", () => {
    const s = session.snapshot.game?.submissions ?? {};
    return Object.keys(s).length === 2 && s;
  }, 15000);
  step("teacher sees submissions: Wrong=" + (subs[id("Wrong")].correct ? "solved" : "wrong") + ", Right=" + (subs[id("Right")].correct ? "solved" : "wrong") + ", Idle=" + (subs[id("Idle")] ? "?" : "thinking"));
  if (subs[id("Wrong")].correct || !subs[id("Right")].correct || subs[id("Idle")]) throw new Error("wrong statuses");
  if (!subs[id("Wrong")].code?.includes("a * b") || subs[id("Wrong")].report?.passed !== 1) throw new Error("wrong code/report");
  const flags = await waitFor("paste flag at the teacher", () => session.snapshot.game?.flags?.[id("Wrong")]?.paste, 8000);
  step("teacher sees anti-cheat flag for Wrong: paste ×" + flags.count);
  // Подсказка на строке 2 кода ученика (как кнопка в таблице отправок).
  session.send({ type: "hint", playerId: id("Wrong"), line: 2, text: "проверь знак операции" });
  await sleep(1000);
  step("hint sent to Wrong on line 2");
  session.send({ type: "end_game" });
  await sleep(500);
}

async function liveTeacherScenario(session, step) {
  await session.createRoom();
  await waitFor("room", () => session.snapshot.code && session.snapshot.status === "online");
  fs.writeFileSync(process.env.CODEARENA_E2E_HANDOFF, session.snapshot.code);
  step("created room " + session.snapshot.code);
  const bot = await waitFor("bot student", () => session.snapshot.lobby && session.snapshot.lobby.players.find((p) => p.name === "Bot"));
  step("bot student joined");

  const uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, "site", "index.html");
  const ed = await vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri));
  await vscode.commands.executeCommand("codearena.shareFile");
  await waitFor("share on", () => session.snapshot.lesson.share);
  step("shared " + session.snapshot.lesson.share.fileName);

  // 10 нажатий подряд — уходят пачками раз в 400 мс.
  await ed.edit((b) => b.insert(new vscode.Position(6, 0), "<!--  -->\n"));
  for (let i = 0; i < 10; i++) {
    await ed.edit((b) => b.insert(new vscode.Position(6, 5 + i), String(i)));
    await sleep(30);
  }
  await sleep(1000);
  step("typed 10 characters into the shared file");

  await vscode.commands.executeCommand("codearena.checkpoint");
  await waitFor("checkpoint 1", () => session.snapshot.lesson.checkpoint === 1);
  step("checkpoint 1 set");
  const p = await waitFor("bot progress", () => session.snapshot.lesson.progress[bot.id] === 40 && 40);
  step("teacher sees bot progress: " + p + "%");

  await vscode.commands.executeCommand("codearena.peek", bot.id);
  const peek = await waitFor("student code opened", () =>
    vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "codearena" && e.document.uri.path.startsWith("/students/")));
  step("peek opened " + peek.document.uri.path + ": " + JSON.stringify(peek.document.getText()));
  if (!peek.document.getText().includes("BOT CODE")) throw new Error("wrong peek text");
  // Подсказка ученику на строке 1 — из открытого кода ученика (без окна ввода).
  await vscode.window.showTextDocument(peek.document, { viewColumn: peek.viewColumn, preserveFocus: false });
  await vscode.commands.executeCommand("codearena.hintLine", { line: 1, text: "закрой тег <p>" });
  step("hint sent from the student's code (line 1)");
  await sleep(800);
  // Возможность подсказать видно: наведение на строку и строка над кодом.
  const hovers = await vscode.commands.executeCommand("vscode.executeHoverProvider", peek.document.uri, new vscode.Position(0, 2));
  const hoverText = (hovers ?? []).flatMap((h) => h.contents.map((c) => (typeof c === "string" ? c : c.value))).join(" ");
  const lenses = await vscode.commands.executeCommand("vscode.executeCodeLensProvider", peek.document.uri);
  const lensTitle = (lenses ?? []).map((l) => l.command?.title ?? "").join(" ");
  step("hover on student's line: " + /Hint on line 1|Подсказать на строке 1/.test(hoverText) + "; lens: " + JSON.stringify(lensTitle.slice(0, 40)));
  if (!/codearena\.hintLine/.test(hoverText) || !/Bot/.test(lensTitle)) throw new Error("hint affordances missing");

  await vscode.commands.executeCommand("codearena.stopShare");
  await waitFor("share off", () => !session.snapshot.lesson.share);
  step("share stopped");
  // Чекпоинт кнопкой в панели: фокус в панели, файл не показывается — эталон из последнего файла.
  await vscode.window.showTextDocument(ed.document, { viewColumn: vscode.ViewColumn.One });
  await vscode.commands.executeCommand("codearena.openPanel");
  await sleep(600);
  await vscode.commands.executeCommand("codearena.checkpoint");
  await waitFor("checkpoint 2", () => session.snapshot.lesson.checkpoint === 2);
  step("checkpoint 2 from the panel (no share, editor not focused): active editor = " + (vscode.window.activeTextEditor ? "file" : "none (panel)"));
  await sleep(800);
}

async function myTasksScenario(api, step) {
  const my = api.myTasks;
  const path = require("node:path");
  // 1) Word: нумерованный список, правильный вариант жирным.
  await vscode.commands.executeCommand("codearena.importTasks", vscode.Uri.file(path.join(process.env.CODEARENA_E2E_FIXTURES, "questions.docx")));
  let r = my.lastResult;
  const counts = (r) => Object.entries(r.byGame).map(([g, t]) => g + " " + t.length).join(", ");
  step("Word file → " + counts(r) + "; library sets: " + my.sets().length);
  if (r.byGame.quiz?.length !== 2 || r.byGame.tug?.length !== 1) throw new Error("docx import wrong: " + JSON.stringify(r));

  // 2) Конспект без заданий в знакомом формате → предложение разобрать с ИИ.
  await vscode.commands.executeCommand("codearena.importTasks", vscode.Uri.file(path.join(process.env.CODEARENA_E2E_TMP, "notes.txt")));
  if (!my.lastResult.unrecognized) throw new Error("notes.txt should be unrecognized");
  step("plain notes → unrecognized, AI offered");

  // 3) Неверный ключ — понятная ошибка.
  await my.storeKey("bad-key-000000000000000000");
  await my.generate({ mode: "generate", game: "quiz", language: "html", topic: "Ссылки", count: 5, difficulty: "easy", locale: "ru" });
  step("bad key → error: " + my.aiState.error);
  if (my.aiState.error !== "bad_key") throw new Error("expected bad_key");

  // 4) Разбор конспекта с ИИ: задания раскладываются по играм.
  await my.storeKey("test-key-1234567890abcdef");
  await my.generate({ mode: "extract", game: "quiz", language: "css", topic: "", count: 20, difficulty: "easy", locale: "ru" });
  r = my.lastResult;
  step("AI read the notes → " + counts(r) + " (model " + my.aiState.model + ")");
  if (r.source !== "ai" || r.byGame.quiz?.length !== 2 || r.byGame.tug?.length !== 1) throw new Error("extract wrong: " + JSON.stringify(r));

  // 5) Генерация Codewars: эталоны запускаются; сломанное чинится одним кругом, остальное отбрасывается.
  await my.generate({ mode: "generate", game: "codewars", language: "javascript", topic: "Массивы: filter", count: 3, difficulty: "easy", locale: "ru" });
  r = my.lastResult;
  const prompts = (r.byGame.codewars || []).map((t) => t.prompt);
  step("AI codewars → kept: " + prompts.join(" | ") + "; skipped: " + r.skipped.map((x) => x.reason).join(", "));
  if (prompts.length !== 2 || !prompts.includes("Чётные (исправлено)") || r.skipped.filter((x) => x.reason === "starter_passes").length !== 1) throw new Error("verification wrong: " + JSON.stringify({ prompts, skipped: r.skipped }));
  step("library now has " + my.sets().length + " sets");
}

exports.run = async function run() {
  const log = [];
  const step = (s) => { log.push(s); console.log("[e2e] " + s); };
  const out = process.env.CODEARENA_E2E_OUT;
  try {
    const ext = vscode.extensions.getExtension("q-werty452.codearena");
    const api = await ext.activate();
    const session = api.session;

    if (SCENARIO === "teacherui") {
      // Учитель создаёт комнату и открывает панель; кликами в webview управляет внешний скрипт по CDP.
      // Ссылки из webview не открываем в настоящем браузере — только записываем.
      const urls = process.env.CODEARENA_E2E_HANDOFF + ".urls";
      try {
        Object.defineProperty(vscode.env, "openExternal", { configurable: true, value: async (u) => (fs.appendFileSync(urls, String(u) + "\n"), true) });
      } catch (e) {
        step("cannot stub openExternal: " + e.message);
      }
      step("openExternal stubbed: " + (vscode.env.openExternal.toString().includes("appendFileSync")));
      await session.createRoom();
      await waitFor("room", () => session.snapshot.code && session.snapshot.status === "online");
      await vscode.commands.executeCommand("codearena.openPanel");
      const watch = await waitFor("watch link", () => session.snapshot.watchLink);
      fs.writeFileSync(process.env.CODEARENA_E2E_HANDOFF + ".watch", watch);
      step("watch link ready: " + watch.replace(/#t=.*/, "#t=…"));
      fs.writeFileSync(process.env.CODEARENA_E2E_HANDOFF, session.snapshot.code);
      step("room " + session.snapshot.code + ", panel open; waiting for the CDP driver");
      await waitFor("driver done", () => fs.existsSync(process.env.CODEARENA_E2E_HANDOFF + ".done"), 170000);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
    if (SCENARIO === "mytasks") {
      // Сценарий сохраняет тестовые ключи Gemini — всегда убрать за собой:
      // в новых VS Code хранилище секретов может быть общим с обычным VS Code.
      try {
        await myTasksScenario(api, step);
      } finally {
        await api.myTasks.clearKey();
      }
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
    if (SCENARIO === "teacherbug") {
      await teacherBugScenario(session, step);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
    if (SCENARIO === "liveteacher") {
      await liveTeacherScenario(session, step);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
    await session.join(process.env.CODEARENA_E2E_CODE, "E2E Student");
    await waitFor("joined", () => session.snapshot.me);
    step("joined room " + session.snapshot.code);
    if (SCENARIO === "flaky") {
      await flakyScenario(session, step);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
    if (SCENARIO === "livestudent") {
      await liveStudentScenario(session, step, api);
      fs.writeFileSync(out, JSON.stringify({ ok: true, log }, null, 2));
      return;
    }
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
    if (SCENARIO === "dartcw" && (!doc.fileName.endsWith(".dart") || !doc.getText().includes("// Верни"))) throw new Error("no .dart file with // header");
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
    const WRONG = SCENARIO === "fixbug" ? '<div class="footer">© 2026</div>' : SCENARIO === "dartcw" ? "List<int> evens(List<int> nums) {\n  return nums;\n}" : "def evens(nums):\n    return nums";
    const RIGHT = SCENARIO === "fixbug" ? "<footer>© 2026</footer>" : SCENARIO === "dartcw" ? "List<int> evens(List<int> nums) => nums.where((n) => n.isEven).toList();" : "def evens(nums):\n    return [n for n in nums if n % 2 == 0]";
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
