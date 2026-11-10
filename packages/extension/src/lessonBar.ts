import * as vscode from "vscode";
import type { LessonStatus, SessionSnapshot } from "@codearena/shared";
import type { Session } from "./session.ts";

/**
 * Урок в статус-баре — чтобы не отрываться от кода.
 * До входа: только «Войти в урок». Ученик: текущий статус, по клику — меню.
 * Учитель: «Готово 18/25 · ❓3», по клику — панель учителя.
 */
const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  join: () => (ru() ? "$(mortar-board) Войти в урок" : "$(mortar-board) Join lesson"),
  joinTip: () => (ru() ? "CodeArena: войти в урок по коду комнаты" : "CodeArena: join a lesson with a room code"),
  status: (s: LessonStatus) =>
    ({ writing: ru() ? "$(edit) Пишу" : "$(edit) Writing", done: ru() ? "$(check) Готово" : "$(check) Done", lost: ru() ? "$(question) Не понял" : "$(question) Lost" })[s],
  game: () => (ru() ? "$(play) Идёт игра" : "$(play) Game on"),
  teacher: (done: number, total: number, confused: number) =>
    `$(organization) ${ru() ? "Готово" : "Done"} ${done}/${total}` + (confused ? `  $(comment-unresolved) ${confused}` : ""),
  pick: () => (ru() ? "Как у тебя дела?" : "How is it going?"),
  done: () => (ru() ? "Готово" : "Done"),
  doneHint: () => (ru() ? "Написал, можно дальше" : "Finished, ready to move on"),
  writing: () => (ru() ? "Ещё пишу" : "Still writing"),
  writingHint: () => (ru() ? "Нужно ещё немного времени" : "Need a bit more time"),
  lost: () => (ru() ? "Не понял" : "Lost"),
  lostHint: () => (ru() ? "Застрял, нужна помощь" : "Stuck, need help"),
  confused: () => (ru() ? "Объясните ещё раз" : "Explain again"),
  confusedHint: () => (ru() ? "Анонимно — учитель увидит только количество" : "Anonymous — the teacher sees only the count"),
  confusedSent: () => (ru() ? "Отправлено анонимно. Учитель видит только, сколько человек просят объяснить." : "Sent anonymously. The teacher only sees how many asked."),
  confusedAlready: () => (ru() ? "уже отправлено на этом шаге" : "already sent for this step"),
};

export class LessonBar implements vscode.Disposable {
  private item = vscode.window.createStatusBarItem("codearena.lesson", vscode.StatusBarAlignment.Left, 1000);
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly session: Session) {
    this.item.name = "CodeArena";
    this.disposables.push(
      this.item,
      vscode.commands.registerCommand("codearena.setStatus", () => this.pick()),
      vscode.commands.registerCommand("codearena.status.done", () => session.setStatus("done")),
      vscode.commands.registerCommand("codearena.status.writing", () => session.setStatus("writing")),
      vscode.commands.registerCommand("codearena.status.lost", () => session.setStatus("lost")),
      vscode.commands.registerCommand("codearena.status.confused", () => this.confused()),
      session.onMessage((m) => m.type === "session" && this.render(m.session)),
    );
    this.render(session.snapshot);
  }

  private render(s: SessionSnapshot): void {
    const inLesson = s.role === "student" && !!s.me && !s.ended;
    void vscode.commands.executeCommand("setContext", "codearena.inLesson", inLesson);
    this.item.backgroundColor = undefined;

    if (s.role === "teacher" && s.lobby) {
      const total = s.lobby.players.length;
      const done = s.lobby.players.filter((p) => s.lesson.statuses[p.id] === "done").length;
      this.item.text = L.teacher(done, total, s.lesson.confused);
      this.item.tooltip = "CodeArena";
      this.item.command = "codearena.openPanel";
      if (s.lesson.confused > 0) this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (inLesson) {
      this.item.text = s.game && s.game.phase !== "over" ? L.game() : L.status(s.lesson.myStatus);
      this.item.tooltip = `CodeArena · ${L.pick()}`;
      this.item.command = s.game && s.game.phase !== "over" ? "codearena.openPanel" : "codearena.setStatus";
      if (s.lesson.myStatus === "lost") this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (s.role === "none") {
      this.item.text = L.join();
      this.item.tooltip = L.joinTip();
      this.item.command = "codearena.join";
    } else {
      this.item.hide();
      return;
    }
    this.item.show();
  }

  /** Меню статуса: Готово / Ещё пишу / Не понял / Объясните ещё раз. */
  private async pick(): Promise<void> {
    const s = this.session.snapshot;
    if (s.role !== "student" || !s.me) return void vscode.commands.executeCommand("codearena.join");
    type Item = vscode.QuickPickItem & { run: () => void };
    const mark = (st: LessonStatus) => (s.lesson.myStatus === st ? "  ✓" : "");
    const items: Item[] = [
      { label: `$(check) ${L.done()}${mark("done")}`, description: "Ctrl+Alt+1", detail: L.doneHint(), run: () => this.session.setStatus("done") },
      { label: `$(edit) ${L.writing()}${mark("writing")}`, description: "Ctrl+Alt+2", detail: L.writingHint(), run: () => this.session.setStatus("writing") },
      { label: `$(question) ${L.lost()}${mark("lost")}`, description: "Ctrl+Alt+3", detail: L.lostHint(), run: () => this.session.setStatus("lost") },
      { label: "", kind: vscode.QuickPickItemKind.Separator, run: () => {} },
      {
        label: `$(comment-unresolved) ${L.confused()}`,
        description: s.lesson.iConfused ? L.confusedAlready() : "Ctrl+Alt+4",
        detail: L.confusedHint(),
        run: () => this.confused(),
      },
    ];
    const chosen = await vscode.window.showQuickPick(items, { title: "CodeArena", placeHolder: L.pick() });
    chosen?.run();
  }

  private confused(): void {
    if (this.session.snapshot.lesson.iConfused) return;
    this.session.confused();
    void vscode.window.showInformationMessage(L.confusedSent());
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
