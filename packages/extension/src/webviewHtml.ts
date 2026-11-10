import * as vscode from "vscode";
import { randomBytes } from "node:crypto";

/**
 * HTML для webview: подключает собранный React-бандл из media/webview
 * со строгой CSP (скрипты только с nonce, без внешних источников).
 */
export function renderWebviewHtml(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  boot: { view: "sidebar" | "panel" },
): string {
  const nonce = randomBytes(16).toString("base64");
  const base = vscode.Uri.joinPath(extensionUri, "media", "webview");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(base, "index.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(base, "index.css"));
  const bootJson = JSON.stringify({ ...boot, language: vscode.env.language }).replace(/</g, "\\u003c");

  return `<!doctype html>
<html lang="${vscode.env.language}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}'; media-src ${webview.cspSource};" />
  <link rel="stylesheet" href="${style}" />
  <title>CodeArena</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__CODEARENA__ = ${bootJson};</script>
  <script nonce="${nonce}" type="module" src="${script}"></script>
</body>
</html>`;
}
