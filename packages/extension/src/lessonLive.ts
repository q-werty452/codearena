import * as vscode from "vscode";
import { basename } from "node:path";
import { lessonProgress, type ServerMessage } from "@codearena/shared";
import { LessonFs } from "./lessonFs.ts";
import type { Session } from "./session.ts";

/**
 * Урок, часть 2.
 * Учитель: показывает один файл (пачкой раз в 400 мс), ставит чекпоинты, смотрит код учеников.
 * Ученик: видит файл учителя рядом (только чтение, можно следовать за курсором),
 * выбирает свой файл урока, расширение считает процент по чекпоинту.
 */
const SHARE_BATCH_MS = 400;
const PROGRESS_MIN_MS = 2000;
const LESSON_FILE_KEY = "codearena.lessonFile";

const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  noEditor: () => (ru() ? "Откройте файл, который хотите показать классу" : "Open the file you want to show the class"),
  sharing: (f: string) => (ru() ? `Классу показывается ${f}` : `Showing ${f} to the class`),
  pickFile: () => (ru() ? "Какой файл — твой файл урока?" : "Which file is your lesson file?"),
  browse: () => (ru() ? "$(folder-opened) Выбрать файл…" : "$(folder-opened) Browse…"),
  chosen: (f: string) => (ru() ? `Файл урока: ${f}. Прогресс считается автоматически.` : `Lesson file: ${f}. Progress is tracked automatically.`),
  choose: () => (ru() ? "Выбрать файл" : "Choose file"),
  needFile: (f: string) =>
    ru() ? `Учитель поставил чекпоинт по ${f}. Выбери свой файл урока, чтобы считался прогресс.` : `The teacher set a checkpoint for ${f}. Choose your lesson file to track progress.`,
};

export class LessonLive implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private fs = new LessonFs();

  // Учитель
  private sharedDoc: vscode.TextDocument | null = null;
  private shareTimer: NodeJS.Timeout | null = null;

  // Ученик
  private teacherUri: vscode.Uri | null = null;
  private openedTeacherOnce = false;
  private refCode: string | null = null;
  private lastSentPercent: number | null = null;
  private lastSentAt = 0;
  private progressTimer: NodeJS.Timeout | null = null;
  private askedForFile = -1;

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly session: Session,
  ) {
    this.disposables.push(
      vscode.workspace.registerFileSystemProvider(LessonFs.scheme, this.fs, { isReadonly: true, isCaseSensitive: true }),
      vscode.commands.registerCommand("codearena.shareFile", () => this.shareActive()),
      vscode.commands.registerCommand("codearena.stopShare", () => this.stopShare()),
      vscode.commands.registerCommand("codearena.checkpoint", () => this.checkpoint()),
      vscode.commands.registerCommand("codearena.openTeacherCode", () => this.openTeacher(false)),
      vscode.commands.registerCommand("codearena.toggleFollow", () => session.patchLesson({ follow: !session.snapshot.lesson.follow })),
      vscode.commands.registerCommand("codearena.chooseLessonFile", () => this.chooseLessonFile()),
      vscode.commands.registerCommand("codearena.peek", (playerId: string) => session.send({ type: "peek", playerId })),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e.document)),
      vscode.window.onDidChangeTextEditorSelection((e) => e.textEditor.document === this.sharedDoc && this.scheduleShare()),
      vscode.workspace.onDidCloseTextDocument((d) => d === this.sharedDoc && this.stopShare()),
      session.onMessage((m) => (m.type === "server" ? this.onServer(m.msg) : m.type === "session" && this.onSession())),
    );
  }

  private get role() {
    return this.session.snapshot.role;
  }

  /* ─────────────── Учитель: показ файла ─────────────── */

  private async shareActive(): Promise<void> {
    if (this.role !== "teacher") return;
    const ed = vscode.window.activeTextEditor ?? vscode.window.visibleTextEditors.find((e) => e.document.uri.scheme === "file");
    if (!ed || ed.document.uri.scheme === LessonFs.scheme) return void vscode.window.showInformationMessage(L.noEditor());
    this.sharedDoc = ed.document;
    this.session.patchLesson({ share: { fileName: basename(ed.document.fileName), line: ed.selection.active.line, version: 0 } });
    this.sendShare();
    void vscode.window.setStatusBarMessage(`$(broadcast) ${L.sharing(basename(ed.document.fileName))}`, 3000);
  }

  private stopShare(): void {
    if (!this.sharedDoc) return;
    this.sharedDoc = null;
    if (this.shareTimer) clearTimeout(this.shareTimer);
    this.shareTimer = null;
    this.session.send({ type: "lesson_share_stop" });
    this.session.patchLesson({ share: null });
  }

  /** Изменения уходят пачкой раз в 400 мс, а не на каждую клавишу. */
  private scheduleShare(): void {
    if (this.shareTimer) return;
    this.shareTimer = setTimeout(() => {
      this.shareTimer = null;
      this.sendShare();
    }, SHARE_BATCH_MS);
  }

  private sendShare(): void {
    const doc = this.sharedDoc;
    if (!doc || this.role !== "teacher") return;
    const ed = vscode.window.visibleTextEditors.find((e) => e.document === doc);
    const line = ed?.selection.active.line ?? 0;
    this.session.send({ type: "lesson_share", fileName: basename(doc.fileName), lang: doc.languageId, text: doc.getText().slice(0, 100_000), line });
    this.session.patchLesson({ share: { fileName: basename(doc.fileName), line, version: (this.session.snapshot.lesson.share?.version ?? 0) + 1 } });
  }

  /** Чекпоинт: текущий код показываемого файла — эталон шага. */
  private checkpoint(): void {
    if (this.role !== "teacher") return;
    const doc = this.sharedDoc ?? (vscode.window.activeTextEditor?.document.uri.scheme === "file" ? vscode.window.activeTextEditor.document : null);
    this.session.send({ type: "checkpoint_set", code: doc?.getText().slice(0, 100_000), fileName: doc ? basename(doc.fileName) : undefined });
  }

  /* ─────────────── Ученик ─────────────── */

  private onServer(msg: ServerMessage): void {
    if (msg.type === "lesson_share" && this.role === "student") {
      this.teacherUri = LessonFs.uri(`/teacher/${msg.fileName}`);
      this.fs.set(this.teacherUri, msg.text);
      if (!this.openedTeacherOnce) {
        this.openedTeacherOnce = true;
        void this.openTeacher(true);
      } else if (this.session.snapshot.lesson.follow) this.follow(msg.line);
    }
    if (msg.type === "lesson_share_off") this.openedTeacherOnce = false;
    if (msg.type === "checkpoint" && this.role === "student") {
      this.refCode = msg.code;
      this.lastSentPercent = null;
      void this.ensureLessonFile(msg.fileName, msg.checkpoint).then(() => this.computeProgress(true));
    }
    if (msg.type === "peek_request" && this.role === "student") void this.replyPeek();
    if (msg.type === "peek_code" && this.role === "teacher") {
      const uri = LessonFs.uri(`/students/${msg.name}/${msg.fileName || "code.txt"}`);
      this.fs.set(uri, msg.text);
      void vscode.window.showTextDocument(uri, { viewColumn: vscode.ViewColumn.Beside, preview: true });
    }
  }

  private onSession(): void {
    const s = this.session.snapshot;
    if (s.role === "none") {
      this.refCode = null;
      this.openedTeacherOnce = false;
      if (this.sharedDoc) this.sharedDoc = null;
    }
    // Учитель вернулся после переподключения и всё ещё показывает файл — переотправим.
    if (s.role === "teacher" && s.status === "online" && this.sharedDoc && !s.lesson.share) this.sendShare();
  }

  private async openTeacher(first: boolean): Promise<void> {
    if (!this.teacherUri) return;
    const doc = await vscode.workspace.openTextDocument(this.teacherUri);
    const ed = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false, preserveFocus: first });
    const line = this.session.snapshot.lesson.share?.line ?? 0;
    ed.revealRange(new vscode.Range(line, 0, line, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }

  /** «Следовать за курсором учителя»: прокрутить к его строке. */
  private follow(line: number): void {
    const ed = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === this.teacherUri?.toString());
    if (!ed) return;
    const range = new vscode.Range(line, 0, line, 0);
    ed.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    ed.selection = new vscode.Selection(line, 0, line, 0);
  }

  private lessonFile(): vscode.Uri | null {
    const saved = this.ctx.workspaceState.get<string>(LESSON_FILE_KEY);
    return saved ? vscode.Uri.parse(saved) : null;
  }

  private async setLessonFile(uri: vscode.Uri): Promise<void> {
    await this.ctx.workspaceState.update(LESSON_FILE_KEY, uri.toString());
    this.session.patchLesson({ myFile: vscode.workspace.asRelativePath(uri) });
    void vscode.window.showInformationMessage(L.chosen(vscode.workspace.asRelativePath(uri)));
    this.computeProgress(true);
  }

  /** Файл урока выбирается один раз: по умолчанию — файл с тем же именем, что у учителя. */
  private async ensureLessonFile(refFile: string, checkpoint: number): Promise<void> {
    const existing = this.lessonFile();
    if (existing) {
      this.session.patchLesson({ myFile: vscode.workspace.asRelativePath(existing) });
      return;
    }
    if (!refFile) return;
    const found = await vscode.workspace.findFiles(`**/${refFile}`, "**/node_modules/**", 5);
    if (found.length === 1) return this.setLessonFile(found[0]!);
    if (this.askedForFile === checkpoint) return;
    this.askedForFile = checkpoint;
    const choice = await vscode.window.showInformationMessage(L.needFile(refFile), L.choose());
    if (choice) await this.chooseLessonFile();
  }

  private async chooseLessonFile(): Promise<void> {
    const ref = this.session.snapshot.lesson.refFile ?? this.session.snapshot.lesson.share?.fileName ?? "";
    const candidates = ref ? await vscode.workspace.findFiles(`**/${ref}`, "**/node_modules/**", 20) : [];
    const open = vscode.window.visibleTextEditors.map((e) => e.document.uri).filter((u) => u.scheme === "file");
    const uris = [...new Map([...candidates, ...open].map((u) => [u.toString(), u])).values()];
    type Item = vscode.QuickPickItem & { uri?: vscode.Uri };
    const items: Item[] = [...uris.map((u) => ({ label: `$(file) ${vscode.workspace.asRelativePath(u)}`, uri: u })), { label: L.browse() }];
    const pick = await vscode.window.showQuickPick(items, { title: "CodeArena", placeHolder: L.pickFile() });
    if (!pick) return;
    let uri = pick.uri;
    if (!uri) [uri] = (await vscode.window.showOpenDialog({ canSelectMany: false })) ?? [];
    if (uri) await this.setLessonFile(uri);
  }

  private onDocChange(doc: vscode.TextDocument): void {
    if (doc === this.sharedDoc) return this.scheduleShare();
    const lf = this.lessonFile();
    if (this.role === "student" && lf && doc.uri.toString() === lf.toString()) this.computeProgress(false);
  }

  /** Процент по чекпоинту: только при изменении и не чаще раза в 2 секунды. */
  private computeProgress(now: boolean): void {
    if (this.progressTimer) clearTimeout(this.progressTimer);
    const run = async () => {
      this.progressTimer = null;
      const lf = this.lessonFile();
      if (this.refCode === null || !lf || this.role !== "student") return;
      const text = (await vscode.workspace.openTextDocument(lf).then((d) => d.getText(), () => null)) ?? "";
      const percent = lessonProgress(this.refCode, text);
      this.session.patchLesson({ myProgress: percent });
      if (percent === this.lastSentPercent) return;
      const wait = PROGRESS_MIN_MS - (Date.now() - this.lastSentAt);
      if (wait > 0) {
        this.progressTimer = setTimeout(run, wait);
        return;
      }
      this.lastSentPercent = percent;
      this.lastSentAt = Date.now();
      this.session.send({ type: "progress", checkpoint: this.session.snapshot.lesson.checkpoint, percent });
    };
    this.progressTimer = setTimeout(run, now ? 0 : 600);
  }

  /** Учитель смотрит код: отдаём файл урока (или активный файл). */
  private async replyPeek(): Promise<void> {
    const lf = this.lessonFile();
    const doc = lf
      ? await vscode.workspace.openTextDocument(lf).then((d) => d, () => null)
      : vscode.window.activeTextEditor?.document.uri.scheme === "file"
        ? vscode.window.activeTextEditor.document
        : null;
    this.session.send({ type: "peek_reply", fileName: doc ? basename(doc.fileName) : "", text: doc?.getText().slice(0, 100_000) ?? "" });
  }

  dispose(): void {
    if (this.shareTimer) clearTimeout(this.shareTimer);
    if (this.progressTimer) clearTimeout(this.progressTimer);
    this.disposables.forEach((d) => d.dispose());
  }
}
