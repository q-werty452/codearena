import * as vscode from "vscode";
import { basename } from "node:path";
import type { ServerMessage } from "@codearena/shared";
import { LessonFs } from "./lessonFs.ts";
import { LESSON_FILE_KEY } from "./lessonLive.ts";
import { relocateHints, type TrackedHint } from "./hintTrack.ts";
import type { Session } from "./session.ts";

/**
 * Подсказки на строке.
 * Учитель смотрит код ученика (VS Code или телефон), ставит курсор на строку и пишет коротко:
 * «тут не закрыт тег». У ученика строка подсвечивается, текст учителя — рядом с ней.
 * Ученик исправил строку — подсказка пропала. Код ученика учитель не меняет.
 */
const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  title: (name: string, line: number) => (ru() ? `Подсказка для ${name} · строка ${line}` : `Hint for ${name} · line ${line}`),
  prompt: () => (ru() ? "Ученик увидит её у себя рядом с этой строкой" : "The student will see it next to this line"),
  placeholder: () => (ru() ? "Например: тут не закрыт тег <p>" : "For example: the <p> tag isn't closed here"),
  empty: () => (ru() ? "Напишите подсказку" : "Write a hint"),
  notStudentCode: () => (ru() ? "Сначала откройте код ученика: «Посмотреть код» в панели учителя" : "Open a student's code first: «View code» in the teacher panel"),
  sent: () => (ru() ? "$(check) Подсказка отправлена" : "$(check) Hint sent"),
  howTo: () => (ru() ? "$(comment) Поставьте курсор на строку и нажмите 💬 вверху — подсказка ученику" : "$(comment) Put the cursor on a line and press 💬 above to send the student a hint"),
  got: (line: number, text: string) => (ru() ? `Учитель: строка ${line} — «${text}»` : `Teacher: line ${line} — «${text}»`),
  show: () => (ru() ? "Показать" : "Show"),
  inline: (text: string) => `  💬 ${ru() ? "Учитель" : "Teacher"}: ${text.length > 110 ? text.slice(0, 107) + "…" : text}`,
};

interface PeekOwner {
  playerId: string;
  name: string;
  fileName: string;
}

export class LessonHints implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  /** Ученик: подсказки по документам. */
  private mine = new Map<string, TrackedHint[]>();
  /** Учитель: чей это открытый код и какие подсказки уже отправлены. */
  private owners = new Map<string, PeekOwner>();
  private sent = new Map<string, { line: number; text: string }[]>();

  private deco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor("codearena.hintBackground"),
    overviewRulerColor: new vscode.ThemeColor("codearena.hintForeground"),
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  });

  constructor(
    private readonly ctx: vscode.ExtensionContext,
    private readonly session: Session,
  ) {
    this.disposables.push(
      this.deco,
      vscode.commands.registerCommand("codearena.hintLine", (args?: { line?: number; text?: string }) => this.hintLine(args)),
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocChange(e.document)),
      vscode.window.onDidChangeVisibleTextEditors(() => this.decorateAll()),
      session.onMessage((m) => {
        if (m.type === "server") this.onServer(m.msg);
        if (m.type === "session" && m.session.role === "none") this.clear();
      }),
    );
  }

  /** Для тестов: подсказки ученика (строки с 1). */
  list(): { file: string; line: number; text: string }[] {
    return [...this.mine].flatMap(([uri, hs]) => hs.map((h) => ({ file: basename(vscode.Uri.parse(uri).path), line: h.line + 1, text: h.text })));
  }

  private onServer(msg: ServerMessage): void {
    const role = this.session.snapshot.role;
    if (msg.type === "peek_code" && role === "teacher") {
      const uri = LessonFs.uri(`/students/${msg.name}/${msg.fileName || "code.txt"}`).toString();
      this.owners.set(uri, { playerId: msg.playerId, name: msg.name, fileName: msg.fileName });
      void vscode.window.setStatusBarMessage(L.howTo(), 8000);
      setTimeout(() => this.decorateAll(), 300);
    }
    if (msg.type === "hint_sent") void vscode.window.setStatusBarMessage(L.sent(), 3000);
    if (msg.type === "hint" && role === "student") void this.receive(msg.line, msg.text, msg.fileName);
  }

  /* ─────────────── Учитель ─────────────── */

  private async hintLine(args?: { line?: number; text?: string }): Promise<void> {
    const ed = vscode.window.activeTextEditor;
    const owner = ed && this.owners.get(ed.document.uri.toString());
    if (!ed || !owner) return void vscode.window.showInformationMessage(L.notStudentCode());
    const line = args?.line ?? ed.selection.active.line + 1;
    const text =
      args?.text ??
      (await vscode.window.showInputBox({
        title: L.title(owner.name, line),
        prompt: L.prompt(),
        placeHolder: L.placeholder(),
        validateInput: (v) => (v.trim() ? null : L.empty()),
      }));
    if (!text?.trim()) return;
    this.session.send({ type: "hint", playerId: owner.playerId, line, text: text.trim().slice(0, 300), fileName: owner.fileName || undefined });
    const key = ed.document.uri.toString();
    const list = (this.sent.get(key) ?? []).filter((h) => h.line !== line - 1);
    list.push({ line: line - 1, text: text.trim() });
    this.sent.set(key, list);
    this.decorateAll();
  }

  /* ─────────────── Ученик ─────────────── */

  /** Файл, к которому относится подсказка: файл урока, иначе открытый файл с тем же именем. */
  private async target(fileName: string): Promise<vscode.TextDocument | null> {
    const same = (d: vscode.TextDocument) => !fileName || basename(d.fileName) === fileName;
    const saved = this.ctx.workspaceState.get<string>(LESSON_FILE_KEY);
    const lesson = saved ? await vscode.workspace.openTextDocument(vscode.Uri.parse(saved)).then((d) => d, () => null) : null;
    if (lesson && same(lesson)) return lesson;
    const active = vscode.window.activeTextEditor?.document;
    if (active?.uri.scheme === "file" && same(active)) return active;
    const visible = vscode.window.visibleTextEditors.map((e) => e.document).find((d) => d.uri.scheme === "file" && same(d));
    if (visible) return visible;
    if (fileName) {
      const [found] = await vscode.workspace.findFiles(`**/${fileName}`, "**/node_modules/**", 1);
      if (found) return vscode.workspace.openTextDocument(found);
    }
    return lesson ?? (active?.uri.scheme === "file" ? active : null);
  }

  private async receive(line: number, text: string, fileName: string): Promise<void> {
    const doc = await this.target(fileName);
    if (!doc) return void vscode.window.showInformationMessage(L.got(line, text));
    const idx = Math.max(0, Math.min(line - 1, doc.lineCount - 1));
    const key = doc.uri.toString();
    const list = (this.mine.get(key) ?? []).filter((h) => h.line !== idx);
    list.push({ line: idx, anchor: doc.lineAt(idx).text, text });
    this.mine.set(key, list);
    this.decorateAll();
    const choice = await vscode.window.showInformationMessage(L.got(idx + 1, text), L.show());
    if (choice) {
      const ed = await vscode.window.showTextDocument(doc, { preview: false });
      const cur = this.mine.get(key)?.find((h) => h.text === text)?.line ?? idx;
      ed.selection = new vscode.Selection(cur, 0, cur, 0);
      ed.revealRange(new vscode.Range(cur, 0, cur, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    }
  }

  private onDocChange(doc: vscode.TextDocument): void {
    const key = doc.uri.toString();
    const list = this.mine.get(key);
    if (list?.length) {
      const lines = doc.getText().split(/\r?\n/);
      const next = relocateHints(list, lines);
      if (next.length) this.mine.set(key, next);
      else this.mine.delete(key);
      this.decorateAll();
    } else if (this.sent.has(key)) this.decorateAll();
  }

  private decorateAll(): void {
    for (const ed of vscode.window.visibleTextEditors) {
      const key = ed.document.uri.toString();
      const hs = this.mine.get(key) ?? this.sent.get(key) ?? [];
      ed.setDecorations(
        this.deco,
        hs
          .filter((h) => h.line < ed.document.lineCount)
          .map((h) => ({
            range: new vscode.Range(h.line, 0, h.line, 0),
            hoverMessage: new vscode.MarkdownString().appendText(L.inline(h.text).trim()),
            renderOptions: { after: { contentText: L.inline(h.text), color: new vscode.ThemeColor("codearena.hintForeground"), fontStyle: "italic" } },
          })),
      );
    }
  }

  private clear(): void {
    this.mine.clear();
    this.owners.clear();
    this.sent.clear();
    this.decorateAll();
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
