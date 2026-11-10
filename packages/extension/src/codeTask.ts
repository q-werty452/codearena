import * as vscode from "vscode";
import type { GameSnapshot, LocalRun } from "@codearena/shared";
import { runChecks, toReport, type Checks } from "./runner.ts";
import type { Session } from "./session.ts";
import { MARKER, extractSolution, fileExtension, taskFileContent, type FileTask } from "./taskFile.ts";

/**
 * Задачи с кодом у ученика: файл с условием и заготовкой в обычном редакторе,
 * кнопки «Запустить тесты» и «Отправить» над кодом (CodeLens), в строке
 * состояния и по Ctrl+Enter. Тесты гоняются локально (runner.ts).
 */

const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  run: () => (ru() ? "$(play) Запустить тесты" : "$(play) Run tests"),
  submit: () => (ru() ? "$(cloud-upload) Отправить" : "$(cloud-upload) Submit"),
  solved: () => (ru() ? "$(pass-filled) Решено" : "$(pass-filled) Solved"),
  running: () => (ru() ? "$(sync~spin) Проверяем…" : "$(sync~spin) Running…"),
  passed: (p: number, t: number) => (ru() ? `Тесты: ${p} из ${t}` : `Tests: ${p} of ${t}`),
};

export class CodeTasks implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private files = new Map<string, vscode.Uri>();
  private gameStamp = 0;
  private lastTaskId: string | null = null;
  private running = false;
  private status: vscode.StatusBarItem;
  private submitItem: vscode.StatusBarItem;
  private lensEmitter = new vscode.EventEmitter<void>();

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly session: Session,
    private readonly showPanelBeside: () => void,
  ) {
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.status.command = "codearena.runTests";
    this.submitItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.submitItem.command = "codearena.submitCode";
    this.submitItem.backgroundColor = new vscode.ThemeColor("statusBarItem.prominentBackground");

    this.disposables.push(
      this.status,
      this.submitItem,
      this.lensEmitter,
      vscode.commands.registerCommand("codearena.runTests", () => this.run(false)),
      vscode.commands.registerCommand("codearena.submitCode", () => this.run(true)),
      vscode.commands.registerCommand("codearena.openTaskFile", () => this.openCurrent()),
      vscode.languages.registerCodeLensProvider([{ language: "html" }, { language: "css" }, { language: "javascript" }, { language: "python" }], {
        onDidChangeCodeLenses: this.lensEmitter.event,
        provideCodeLenses: (doc) => this.lenses(doc),
      }),
      vscode.window.onDidChangeActiveTextEditor(() => this.refreshUi()),
      session.onMessage((m) => m.type === "session" && this.onSnapshot()),
    );
  }

  private get game(): GameSnapshot | null {
    return this.session.snapshot.game;
  }

  /** Задача, которую ученик решает в редакторе: Codewars или «Исправь баг». */
  private currentTask(): FileTask | null {
    const g = this.game;
    if (this.session.snapshot.role !== "student" || !g?.task) return null;
    if (g.kind === "codewars" && g.task.type === "code") return g.task as FileTask;
    if (g.kind === "bug" && g.task.type === "fix_bug") return g.task as FileTask;
    if (g.kind === "race" && g.task.type === "code") return g.task as FileTask;
    return null;
  }

  private isTaskFile(uri: vscode.Uri | undefined): boolean {
    return !!uri && [...this.files.values()].some((f) => f.toString() === uri.toString());
  }

  /** Новое задание — создать файл и открыть рядом с панелью игры. */
  private onSnapshot(): void {
    const g = this.game;
    if (!g || g.phase === "countdown") {
      if (!g) this.lastTaskId = null;
      if (g?.phase === "countdown" && g.index < 0) this.gameStamp = Date.now();
    }
    const task = this.currentTask();
    if (task && task.id !== this.lastTaskId && (g?.phase === "playing" || g?.phase === "paused")) {
      this.lastTaskId = task.id;
      void this.openTask(task, g!.index);
    }
    this.refreshUi();
  }

  private async openTask(task: FileTask, index: number): Promise<void> {
    const dir = vscode.Uri.joinPath(this.ctx.globalStorageUri, "tasks", this.session.snapshot.code ?? "room", String(this.gameStamp || Date.now()));
    const file = vscode.Uri.joinPath(dir, `task-${index + 1}.${fileExtension(task.language)}`);
    this.files.set(task.id, file);
    await vscode.workspace.fs.createDirectory(dir);
    // Файл уже есть (переподключение) — не затираем код ученика.
    const exists = await vscode.workspace.fs.stat(file).then(() => true, () => false);
    if (!exists) await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(taskFileContent(task, index, ru())));
    const doc = await vscode.workspace.openTextDocument(file);
    const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preview: false });
    // Курсор — в конец заготовки, где пишут решение.
    const last = doc.lineCount - 1;
    editor.selection = new vscode.Selection(last, 0, last, 0);
    this.showPanelBeside();
    this.refreshUi();
  }

  private async openCurrent(): Promise<void> {
    const task = this.currentTask();
    if (!task) return;
    const file = this.files.get(task.id);
    if (file) await vscode.window.showTextDocument(file, { viewColumn: vscode.ViewColumn.One, preview: false });
    else await this.openTask(task, this.game!.index);
  }

  /** «Запустить тесты» (submit=false) или «Отправить» (submit=true). */
  private async run(submit: boolean): Promise<void> {
    const task = this.currentTask();
    const g = this.game;
    if (!task || !g || this.running) return;
    if (g.result?.correct) return; // уже решено
    if (g.phase !== "playing") return;
    const file = this.files.get(task.id);
    if (!file) return void this.openCurrent();

    const doc = await vscode.workspace.openTextDocument(file);
    const code = extractSolution(doc.getText());
    const checks: Checks = { tests: task.tests, rules: task.rules ?? [] };
    this.running = true;
    this.setRun({ taskId: task.id, running: true, results: [], error: null, submitted: submit });
    this.refreshUi();
    try {
      const outcome = await runChecks(task.language, code, checks);
      this.setRun({ taskId: task.id, running: false, results: outcome.results, error: outcome.error, message: outcome.message, submitted: submit });
      if (outcome.error === "no_python" || outcome.error === "no_runtime") return;
      if (submit) this.session.send({ type: "submit", taskId: task.id, code, report: toReport(outcome, checks) });
    } finally {
      this.running = false;
      this.refreshUi();
    }
  }

  private setRun(run: LocalRun): void {
    this.session.patchGame({ localRun: run });
  }

  private lenses(doc: vscode.TextDocument): vscode.CodeLens[] {
    if (!this.isTaskFile(doc.uri)) return [];
    const line = Math.max(0, doc.getText().split(/\r?\n/).findIndex((l) => l.includes(MARKER)));
    const range = new vscode.Range(line, 0, line, 0);
    if (this.game?.result?.correct) return [new vscode.CodeLens(range, { title: L.solved(), command: "" })];
    const run = this.game?.localRun;
    const lenses = [
      new vscode.CodeLens(range, { title: this.running ? L.running() : L.run(), command: "codearena.runTests" }),
      new vscode.CodeLens(range, { title: `${L.submit()}  (Ctrl+Enter)`, command: "codearena.submitCode" }),
    ];
    if (run && !run.running && !run.error && run.results.length) {
      const passed = run.results.filter((r) => r.ok).length;
      lenses.push(new vscode.CodeLens(range, { title: `${passed === run.results.length ? "$(pass)" : "$(error)"} ${L.passed(passed, run.results.length)}`, command: "codearena.openPanel" }));
    }
    return lenses;
  }

  private refreshUi(): void {
    const editor = vscode.window.activeTextEditor;
    const active = this.isTaskFile(editor?.document.uri) && !!this.currentTask();
    void vscode.commands.executeCommand("setContext", "codearena.taskFile", active);
    const solved = !!this.game?.result?.correct;
    if (active) {
      this.status.text = solved ? L.solved() : this.running ? L.running() : L.run();
      this.status.show();
      if (solved) this.submitItem.hide();
      else {
        this.submitItem.text = L.submit();
        this.submitItem.show();
      }
    } else {
      this.status.hide();
      this.submitItem.hide();
    }
    this.lensEmitter.fire();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
