import * as vscode from "vscode";
import { homedir } from "node:os";
import { TaskSet, type HostToUi, type UiToHost } from "@codearena/shared";
import { renderWebviewHtml } from "./webviewHtml.ts";
import { Session } from "./session.ts";
import { CodeTasks } from "./codeTask.ts";
import { runChecks } from "./runner.ts";

/**
 * CodeArena — точка входа расширения.
 * Боковая панель: вход ученика, лобби, статус учителя.
 * Панель игры: лобби и управление учителя, позже — сами игры.
 */

let session: Session;
let sidebar: WebviewHost;

/** API для сквозных тестов (e2e/), пользователям не нужно. */
export interface CodeArenaApi {
  session: Session;
}

export function activate(context: vscode.ExtensionContext): CodeArenaApi {
  session = new Session(context);
  sidebar = new WebviewHost(context, "sidebar");

  context.subscriptions.push(
    session,
    session.onMessage((m) => {
      sidebar.post(m);
      GamePanel.current?.post(m);
    }),
    vscode.window.registerWebviewViewProvider("codearena.sidebar", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("codearena.openPanel", () => GamePanel.show(context)),
    vscode.commands.registerCommand("codearena.join", async (code?: string) => {
      await vscode.commands.executeCommand("codearena.sidebar.focus");
      if (code) sidebar.post({ type: "prefill", code });
    }),
    vscode.commands.registerCommand("codearena.createRoom", async () => {
      await session.createRoom();
      if (session.snapshot.role === "teacher") GamePanel.show(context);
    }),
    vscode.commands.registerCommand("codearena.leave", () => session.leave()),
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path === "/join") {
          const code = new URLSearchParams(uri.query).get("code") ?? "";
          if (/^\d{6}$/.test(code)) void vscode.commands.executeCommand("codearena.join", code);
        }
      },
    }),
  );

  // Началась игра — ученику открываем панель игры (там вопросы и плитки).
  session.onGameStarted = () => GamePanel.show(context);
  // Codewars: файл задачи в редакторе, панель игры — рядом.
  context.subscriptions.push(new CodeTasks(context, session, () => GamePanel.show(context, vscode.ViewColumn.Two, true)));

  void session.restore();
  return { session };
}

/** Набор заданий → файл .codearena.json */
async function saveTasks(set: TaskSet): Promise<void> {
  const name = (set.title || "quiz").replace(/[^\p{L}\p{N}_-]+/gu, "-").slice(0, 40) || "quiz";
  const uri = await vscode.window.showSaveDialog({
    defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders?.[0]?.uri ?? vscode.Uri.file(homedir()), `${name}.codearena.json`),
    filters: { "CodeArena": ["json"] },
  });
  if (!uri) return;
  await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(JSON.stringify(set, null, 2) + "\n"));
  void vscode.window.showInformationMessage(vscode.l10n.t("Saved: {0}", uri.fsPath));
}

/** Файл → набор заданий (проверяется схемой, мусор отклоняется). */
async function loadTasks(): Promise<TaskSet | null> {
  const [uri] = (await vscode.window.showOpenDialog({ canSelectMany: false, filters: { "CodeArena": ["json"] } })) ?? [];
  if (!uri) return null;
  try {
    const raw = JSON.parse(new TextDecoder().decode(await vscode.workspace.fs.readFile(uri)));
    return TaskSet.parse(raw);
  } catch {
    void vscode.window.showErrorMessage(vscode.l10n.t("This file is not a CodeArena task set."));
    return null;
  }
}

export function deactivate(): void {}

/** Общая логика webview: ready-рукопожатие, очередь сообщений, команды от UI. */
class WebviewHost implements vscode.WebviewViewProvider {
  private webview?: vscode.Webview;
  private ready = false;
  private pending: HostToUi[] = [];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly view: "sidebar" | "panel",
  ) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.attach(view.webview);
  }

  attach(webview: vscode.Webview): void {
    this.webview = webview;
    this.ready = false;
    webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    webview.html = renderWebviewHtml(webview, this.context.extensionUri, { view: this.view });
    webview.onDidReceiveMessage((m: UiToHost) => void this.onMessage(m), undefined, this.context.subscriptions);
  }

  post(msg: HostToUi): void {
    if (this.webview && this.ready) void this.webview.postMessage(msg);
    else if (msg.type !== "session") this.pending.push(msg); // снимок всё равно уйдёт при ready
  }

  private async onMessage(msg: UiToHost): Promise<void> {
    switch (msg?.type) {
      case "ready":
        this.ready = true;
        void this.webview?.postMessage({ type: "session", session: session.snapshot } satisfies HostToUi);
        for (const m of this.pending.splice(0)) void this.webview?.postMessage(m);
        break;
      case "join":
        if (/^\d{6}$/.test(msg.code)) await session.join(msg.code, msg.name);
        break;
      case "create_room":
        await vscode.commands.executeCommand("codearena.createRoom");
        break;
      case "leave":
        await session.leave();
        break;
      case "open_panel":
        await vscode.commands.executeCommand("codearena.openPanel");
        break;
      case "copy":
        await vscode.env.clipboard.writeText(msg.text);
        break;
      case "send":
        session.send(msg.msg);
        break;
      case "answer":
        session.answer(msg.taskId, msg.answer);
        break;
      case "save_tasks":
        await saveTasks(msg.set);
        break;
      case "open_task_file":
        await vscode.commands.executeCommand("codearena.openTaskFile");
        break;
      case "run_tests":
        await vscode.commands.executeCommand("codearena.runTests");
        break;
      case "submit_code":
        await vscode.commands.executeCommand("codearena.submitCode");
        break;
      case "check_code": {
        const o = await runChecks(msg.language, msg.code, { tests: msg.tests, rules: msg.rules ?? [] });
        this.post({ type: "check_result", requestId: msg.requestId, results: o.results, error: o.error, message: o.message });
        break;
      }
      case "load_tasks": {
        const set = await loadTasks();
        if (set) this.post({ type: "tasks_loaded", set });
        break;
      }
    }
  }
}

class GamePanel {
  static current?: GamePanel;
  private readonly host: WebviewHost;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
  ) {
    this.host = new WebviewHost(context, "panel");
    this.host.attach(panel.webview);
    panel.onDidDispose(() => (GamePanel.current = undefined), undefined, context.subscriptions);
  }

  static show(context: vscode.ExtensionContext, column: vscode.ViewColumn = vscode.ViewColumn.Active, preserveFocus = false): void {
    if (GamePanel.current) {
      GamePanel.current.panel.reveal(column === vscode.ViewColumn.Active ? undefined : column, preserveFocus);
      return;
    }
    const panel = vscode.window.createWebviewPanel("codearena.game", "CodeArena", { viewColumn: column, preserveFocus }, {
      retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    GamePanel.current = new GamePanel(panel, context);
  }

  post(msg: HostToUi): void {
    this.host.post(msg);
  }
}
