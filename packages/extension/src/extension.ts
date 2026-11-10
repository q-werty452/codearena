import * as vscode from "vscode";
import type { HostToUi, UiToHost } from "@codearena/shared";
import { renderWebviewHtml } from "./webviewHtml.ts";
import { Session } from "./session.ts";

/**
 * CodeArena — точка входа расширения.
 * Боковая панель: вход ученика, лобби, статус учителя.
 * Панель игры: лобби и управление учителя, позже — сами игры.
 */

let session: Session;
let sidebar: WebviewHost;

export function activate(context: vscode.ExtensionContext): void {
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

  void session.restore();
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

  static show(context: vscode.ExtensionContext): void {
    if (GamePanel.current) {
      GamePanel.current.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("codearena.game", "CodeArena", vscode.ViewColumn.Active, {
      retainContextWhenHidden: true,
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "icon.png");
    GamePanel.current = new GamePanel(panel, context);
  }

  post(msg: HostToUi): void {
    this.host.post(msg);
  }
}
