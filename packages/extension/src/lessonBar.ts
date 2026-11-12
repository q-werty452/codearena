import * as vscode from "vscode";
import { isDone, type LessonStatus, type SessionSnapshot } from "@codearena/shared";
import type { Session } from "./session.ts";

/**
 * Значок CodeArena справа в строке состояния — только иконка, без текста.
 * Клик и наведение — маленькое окошко с кнопками
 * (как у Copilot): у ученика «готово / пишу / не понял / объясните ещё раз»,
 * у учителя — сводка класса и быстрые действия, до входа — «Войти в урок».
 * Подсветка: у ученика «не понял», у учителя — есть просьбы объяснить ещё раз.
 */
const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  join: () => (ru() ? "Войти в урок" : "Join lesson"),
  joinHint: () => (ru() ? "по коду комнаты от учителя" : "with the room code from your teacher"),
  status: (s: LessonStatus) => ({ writing: ru() ? "пишу" : "writing", done: ru() ? "готово" : "done", lost: ru() ? "не понял" : "lost" })[s],
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
  lesson: () => (ru() ? "Урок" : "Lesson"),
  room: () => (ru() ? "комната" : "room"),
  progress: () => (ru() ? "Прогресс по шагу" : "Step progress"),
  openPanel: () => (ru() ? "Открыть панель" : "Open panel"),
  gameOn: () => (ru() ? "Идёт игра — отвечай в панели" : "A game is on — answer in the panel"),
  hintKeys: () => (ru() ? "Клавиши: Ctrl+Alt+1…4" : "Keys: Ctrl+Alt+1…4"),
  sumDone: () => (ru() ? "готово" : "done"),
  sumWriting: () => (ru() ? "пишут" : "writing"),
  sumLost: () => (ru() ? "не поняли" : "lost"),
  sumConfused: () => (ru() ? "просят объяснить ещё раз" : "asked to explain again"),
  lostNames: () => (ru() ? "Не поняли" : "Lost"),
  shareFile: () => (ru() ? "Показать мой файл" : "Show my file"),
  checkpoint: () => (ru() ? "Новый шаг" : "Next step"),
  noStudents: () => (ru() ? "Пока никто не вошёл" : "Nobody joined yet"),
};

const COMMANDS = [
  "codearena.status.done",
  "codearena.status.writing",
  "codearena.status.lost",
  "codearena.status.confused",
  "codearena.openPanel",
  "codearena.join",
  "codearena.shareFile",
  "codearena.checkpoint",
  "codearena.sidebar.focus",
];

/** Имена пишут ученики — экранируем всё, что markdown может понять как разметку или ссылку. */
const esc = (t: string) => t.replace(/[\\`*_{}[\]()<>#+\-.!|~&$]/g, (c) => "\\" + c);

/** Ссылка-кнопка в окошке; текущий выбор — жирным. */
const btn = (icon: string, text: string, cmd: string, active = false) =>
  `[$(${icon}) ${active ? `**${text}**` : text}](command:${cmd})`;

function tip(lines: string[]): vscode.MarkdownString {
  const md = new vscode.MarkdownString(lines.join("\n\n"), true);
  md.isTrusted = { enabledCommands: COMMANDS };
  return md;
}

/** Окошко ученика. */
export function studentTip(s: SessionSnapshot): string[] {
  const head = `**CodeArena** · ${L.lesson()}` + (s.code ? ` · ${L.room()} ${esc(s.code)}` : "");
  if (s.game && s.game.phase !== "over") return [head, L.gameOn(), "---", btn("window", L.openPanel(), "codearena.openPanel")];
  const st = s.lesson.myStatus;
  const lines = [head];
  if (s.lesson.myProgress !== null) lines.push(`${L.progress()}: **${s.lesson.myProgress}%**`);
  lines.push(
    "---",
    [
      btn("check", L.done(), "codearena.status.done", st === "done"),
      btn("edit", L.writing(), "codearena.status.writing", st === "writing"),
      btn("question", L.lost(), "codearena.status.lost", st === "lost"),
    ].join(" &nbsp;·&nbsp; "),
    s.lesson.iConfused
      ? `$(comment-unresolved) ${L.confused()} — _${L.confusedAlready()}_`
      : `${btn("comment-unresolved", L.confused(), "codearena.status.confused")} — _${L.confusedHint()}_`,
    "---",
    `${btn("window", L.openPanel(), "codearena.openPanel")} &nbsp;·&nbsp; _${L.hintKeys()}_`,
  );
  return lines;
}

/** Окошко учителя: сводка класса и быстрые действия. */
export function teacherTip(s: SessionSnapshot): string[] {
  const players = s.lobby?.players ?? [];
  const head = `**CodeArena** · ${L.lesson()}` + (s.lobby ? ` · ${L.room()} ${esc(s.lobby.code)}` : "");
  const done = players.filter((p) => isDone(s.lesson, p.id));
  const lost = players.filter((p) => !isDone(s.lesson, p.id) && s.lesson.statuses[p.id] === "lost");
  const writing = players.length - done.length - lost.length;
  const lines = [head];
  if (players.length === 0) lines.push(L.noStudents());
  else {
    lines.push(
      `$(check) ${L.sumDone()} **${done.length}/${players.length}** &nbsp;·&nbsp; $(edit) ${L.sumWriting()} **${writing}** &nbsp;·&nbsp; $(question) ${L.sumLost()} **${lost.length}**`,
    );
    if (lost.length) lines.push(`${L.lostNames()}: ${lost.map((p) => esc(p.name)).join(", ")}`);
  }
  if (s.lesson.confused > 0) lines.push(`$(comment-unresolved) ${L.sumConfused()}: **${s.lesson.confused}**`);
  lines.push(
    "---",
    [
      btn("broadcast", L.shareFile(), "codearena.shareFile"),
      btn("debug-step-over", L.checkpoint(), "codearena.checkpoint"),
      btn("window", L.openPanel(), "codearena.openPanel"),
    ].join(" &nbsp;·&nbsp; "),
  );
  return lines;
}

export class LessonBar implements vscode.Disposable {
  private item = vscode.window.createStatusBarItem("codearena.lesson", vscode.StatusBarAlignment.Right, 1000);
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly session: Session) {
    this.item.name = "CodeArena";
    this.disposables.push(
      this.item,
      vscode.commands.registerCommand("codearena.setStatus", () => this.pick()),
      // Клик по значку: после клика фокус на нём — встроенная команда показывает его окошко.
      vscode.commands.registerCommand("codearena.barMenu", () => vscode.commands.executeCommand("workbench.action.showHover")),
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
    void vscode.commands.executeCommand("setContext", "codearena.isTeacher", s.role === "teacher" && !!s.lobby);
    this.item.text = "$(mortar-board)";
    this.item.command = "codearena.barMenu";
    this.item.backgroundColor = undefined;
    if (s.role === "teacher" && s.lobby) {
      this.item.tooltip = tip(teacherTip(s));
      this.item.accessibilityInformation = { label: `CodeArena: ${s.lobby.players.filter((p) => isDone(s.lesson, p.id)).length}/${s.lobby.players.length}` };
      if (s.lesson.confused > 0) this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else if (inLesson) {
      this.item.tooltip = tip(studentTip(s));
      this.item.accessibilityInformation = { label: `CodeArena: ${L.status(s.lesson.myStatus)}` };
      if (s.lesson.myStatus === "lost") this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    } else {
      this.item.tooltip = tip(["**CodeArena**", "---", `${btn("sign-in", L.join(), "codearena.join")} — _${L.joinHint()}_`]);
      this.item.accessibilityInformation = { label: "CodeArena" };
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
