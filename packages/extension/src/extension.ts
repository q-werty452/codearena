import * as vscode from "vscode";
import { renderWebviewHtml } from "./webviewHtml.ts";

/**
 * CodeArena — точка входа расширения.
 * Этап 1: боковая панель с экраном входа, панель игры, обработка ссылки
 * vscode://<publisher>.codearena/join?code=123456.
 * Сеть, лобби и игры подключаются на следующих этапах.
 */

let sidebar: SidebarProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  sidebar = new SidebarProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codearena.sidebar", sidebar, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("codearena.openPanel", () => GamePanel.show(context)),
    vscode.commands.registerCommand("codearena.join", async (code?: string) => {
      await vscode.commands.executeCommand("codearena.sidebar.focus");
      if (code) sidebar?.post({ type: "prefill", code });
    }),
    vscode.window.registerUriHandler({
      handleUri(uri) {
        if (uri.path === "/join") {
          const code = new URLSearchParams(uri.query).get("code") ?? "";
          if (/^\d{6}$/.test(code)) void vscode.commands.executeCommand("codearena.join", code);
        }
      },
    }),
  );
}

export function deactivate(): void {}

class SidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private ready = false;
  private pending: unknown[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {}

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, "media")],
    };
    view.webview.html = renderWebviewHtml(view.webview, this.context.extensionUri, { view: "sidebar" });
    this.ready = false;
    view.webview.onDidReceiveMessage((msg) => this.onMessage(msg), undefined, this.context.subscriptions);
  }

  /** Сообщения до загрузки React копятся и уходят после сигнала ready. */
  post(msg: unknown): void {
    if (this.view && this.ready) void this.view.webview.postMessage(msg);
    else this.pending.push(msg);
  }

  private onMessage(msg: { type?: string }): void {
    switch (msg?.type) {
      case "ready":
        this.ready = true;
        for (const m of this.pending.splice(0)) void this.view?.webview.postMessage(m);
        break;
      case "create_room":
        void vscode.commands.executeCommand("codearena.openPanel");
        break;
      default:
        // Этап 2: подключение к серверу.
        console.log("[codearena] sidebar →", msg);
    }
  }
}

class GamePanel {
  private static current?: vscode.WebviewPanel;

  static show(context: vscode.ExtensionContext): void {
    if (GamePanel.current) {
      GamePanel.current.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel("codearena.game", "CodeArena", vscode.ViewColumn.Active, {
      enableScripts: true,
      retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")],
    });
    panel.iconPath = vscode.Uri.joinPath(context.extensionUri, "media", "activity.svg");
    panel.webview.html = renderWebviewHtml(panel.webview, context.extensionUri, { view: "panel" });
    panel.onDidDispose(() => (GamePanel.current = undefined), undefined, context.subscriptions);
    GamePanel.current = panel;
  }
}
