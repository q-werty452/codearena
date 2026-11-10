import * as vscode from "vscode";
import type { FlagKind } from "@codearena/shared";
import type { Session } from "./session.ts";

/**
 * Защита от списывания. Работает только во время игры (в уроке выключена)
 * и только для включённых учителем защит. Ничего не банит: большие вставки
 * блокируются, а учителю уходят флаги — решение принимает он.
 */

/** ИИ-ассистенты, о которых стоит знать учителю. id расширения → понятное имя. */
export const AI_EXTENSIONS: Record<string, string> = {
  "github.copilot": "GitHub Copilot",
  "github.copilot-chat": "GitHub Copilot Chat",
  "codeium.codeium": "Codeium (Windsurf)",
  "tabnine.tabnine-vscode": "Tabnine",
  "continue.continue": "Continue",
  "saoudrizwan.claude-dev": "Cline",
  "rooveterinaryinc.roo-cline": "Roo Code",
  "kilocode.kilo-code": "Kilo Code",
  "anthropic.claude-code": "Claude Code",
  "google.geminicodeassist": "Gemini Code Assist",
  "amazonwebservices.amazon-q-vscode": "Amazon Q",
  "supermaven.supermaven": "Supermaven",
  "sourcegraph.cody-ai": "Cody",
  "blackboxapp.blackbox": "Blackbox AI",
  "openai.chatgpt": "ChatGPT / Codex",
  "qodo.qodo-gen": "Qodo Gen",
  "bito.bito": "Bito",
};

const ru = () => vscode.env.language.toLowerCase().startsWith("ru");
const L = {
  pasteOff: (n: number) => (ru() ? `Вставка больше ${n} символов отключена в этой игре` : `Pasting more than ${n} characters is off in this game`),
};

/** Пользователь вернулся меньше чем через это время — не считаем (случайный клик). */
const MIN_AWAY_MS = 1500;

export class AntiCheat implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  /** Последний разрешённый текст файлов задач — к нему откатываем большие вставки. */
  private snapshots = new Map<string, string>();
  private reverting = false;
  private awaySince: number | null = null;
  private aiChecked = false;

  constructor(
    private readonly session: Session,
    private readonly isTaskFile: (uri: vscode.Uri) => boolean,
  ) {
    this.disposables.push(
      vscode.commands.registerCommand("codearena.paste", () => this.paste()),
      vscode.workspace.onDidChangeTextDocument((e) => void this.onChange(e)),
      vscode.window.onDidChangeActiveTextEditor((ed) => this.remember(ed?.document)),
      vscode.window.onDidChangeWindowState((s) => this.onWindow(s.focused)),
      session.onMessage((m) => m.type === "session" && this.refresh()),
    );
    this.refresh();
  }

  private get settings() {
    const g = this.session.snapshot.game;
    return g?.settings.antiCheat;
  }

  /** Анти-чит включён: ученик, идёт игра (не итоги). В уроке — выключен. */
  private get active(): boolean {
    const s = this.session.snapshot;
    return s.role === "student" && !!s.me && !!s.game && s.game.phase !== "over";
  }

  private refresh(): void {
    const on = this.active;
    const ac = this.settings;
    void vscode.commands.executeCommand("setContext", "codearena.pasteGuard", on && !!ac?.pasteBlock);
    if (!on) {
      this.aiChecked = false; // новая игра — снова проверим расширения
      this.awaySince = null;
      return;
    }
    for (const ed of vscode.window.visibleTextEditors) this.remember(ed.document);
    if (!this.aiChecked && ac?.aiExtensions) {
      this.aiChecked = true;
      const found = vscode.extensions.all.filter((x) => AI_EXTENSIONS[x.id.toLowerCase()]).map((x) => AI_EXTENSIONS[x.id.toLowerCase()]!);
      if (found.length) this.flag("ai_extension", found.join(", "));
    }
  }

  private flag(kind: FlagKind, detail: string): void {
    this.session.send({ type: "flag", kind, detail: detail.slice(0, 200) });
  }

  private remember(doc: vscode.TextDocument | undefined): void {
    if (doc && this.isTaskFile(doc.uri) && !this.snapshots.has(doc.uri.toString())) this.snapshots.set(doc.uri.toString(), doc.getText());
  }

  /** Ctrl+V / Cmd+V в файле задачи: короткое — вставляем, длинное — нет и флаг. */
  private async paste(): Promise<void> {
    const limit = this.settings?.pasteLimit ?? 30;
    const text = await vscode.env.clipboard.readText();
    if (text.length <= limit || !this.active) {
      await vscode.commands.executeCommand("editor.action.clipboardPasteAction");
      return;
    }
    this.flag("paste", String(text.length));
    void vscode.window.showWarningMessage(L.pasteOff(limit));
  }

  /** Вставка через меню, перетаскивание или ИИ-автодополнение: большое добавление откатываем. */
  private async onChange(e: vscode.TextDocumentChangeEvent): Promise<void> {
    const key = e.document.uri.toString();
    if (!this.isTaskFile(e.document.uri) || e.contentChanges.length === 0) return;
    const ac = this.settings;
    const undoRedo = e.reason === vscode.TextDocumentChangeReason.Undo || e.reason === vscode.TextDocumentChangeReason.Redo;
    if (this.reverting || !this.active || !ac?.bigInsertDetect || undoRedo) {
      this.snapshots.set(key, e.document.getText());
      return;
    }
    const limit = ac.pasteLimit;
    const big = e.contentChanges.find((c) => c.text.replace(/\s/g, "").length > limit && c.text.length - c.rangeLength > limit);
    const before = this.snapshots.get(key);
    if (!big || before === undefined) {
      this.snapshots.set(key, e.document.getText());
      return;
    }
    // Откат к последнему разрешённому тексту.
    this.reverting = true;
    try {
      const edit = new vscode.WorkspaceEdit();
      edit.replace(e.document.uri, new vscode.Range(0, 0, e.document.lineCount, 0), before);
      await vscode.workspace.applyEdit(edit);
    } finally {
      this.reverting = false;
    }
    this.flag("big_insert", String(big.text.length));
    void vscode.window.showWarningMessage(L.pasteOff(limit));
  }

  /** Ушёл из окна VS Code: считаем, сколько раз и сколько секунд. */
  private onWindow(focused: boolean): void {
    if (!this.active || !this.settings?.focusTracking) {
      this.awaySince = null;
      return;
    }
    if (!focused) this.awaySince ??= Date.now();
    else if (this.awaySince !== null) {
      const ms = Date.now() - this.awaySince;
      this.awaySince = null;
      if (ms >= MIN_AWAY_MS) this.flag("focus_lost", (ms / 1000).toFixed(1));
    }
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
  }
}
