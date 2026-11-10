import { EXTENSION_ID } from "@codearena/shared";

/**
 * Страница-приглашение /j/123456: ссылки vscode:// не кликаются в мессенджерах,
 * а обычная https-ссылка — да. Страница открывает VS Code и показывает код.
 */
export function joinPage(code: string): Response {
  const link = (scheme: string) => `${scheme}://${EXTENSION_ID}/join?code=${code}`;
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CodeArena · ${pretty}</title>
<meta name="description" content="Войти в игру CodeArena в VS Code. Код комнаты ${pretty}" />
<style>
  :root { --bg:#fafafa; --fg:#18181b; --muted:#71717a; --card:#fff; --border:#e4e4e7; --accent:#8b5cf6; }
  @media (prefers-color-scheme: dark) { :root { --bg:#111113; --fg:#ececef; --muted:#a1a1aa; --card:#18181b; --border:#2a2a30; } }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font: 15px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; padding:16px; }
  .card { width:100%; max-width:380px; background:var(--card); border:1px solid var(--border); border-radius:16px; padding:28px 24px; text-align:center; }
  .logo { width:52px; height:52px; margin:0 auto 14px; }
  h1 { font-size:20px; margin:0 0 4px; }
  p { margin:0; color:var(--muted); }
  .code { font: 700 44px/1 ui-monospace, "JetBrains Mono", Menlo, monospace; letter-spacing:.06em; margin:22px 0 6px; font-variant-numeric: tabular-nums; }
  .btn { display:flex; align-items:center; justify-content:center; gap:8px; height:48px; margin-top:22px; border-radius:10px;
         background:var(--accent); color:#fff; font-weight:600; font-size:16px; text-decoration:none; }
  .btn:hover { background:#7c4ff0; }
  .alt { margin-top:14px; font-size:13px; }
  .alt a { color:var(--muted); }
  ol { text-align:left; color:var(--muted); font-size:13px; padding-left:20px; margin:22px 0 0; }
  ol a { color:var(--accent); }
</style>
</head>
<body>
<main class="card">
  <svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#A78BFA"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#g)"/><path d="M12.5 10.5 7 16l5.5 5.5M19.5 10.5 25 16l-5.5 5.5" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="16" cy="16" r="1.9" fill="#fff"/></svg>
  <h1>Тебя зовут в игру</h1>
  <p>CodeArena — игры по программированию в VS Code</p>
  <div class="code">${pretty}</div>
  <p>код комнаты</p>
  <a class="btn" href="${link("vscode")}">Открыть в VS Code</a>
  <div class="alt"><a href="${link("vscodium")}">VSCodium</a> · <a href="${link("cursor")}">Cursor</a></div>
  <ol>
    <li>Нет расширения? <a href="https://marketplace.visualstudio.com/items?itemName=${EXTENSION_ID}">Установи CodeArena</a>.</li>
    <li>Если кнопка не сработала — открой CodeArena в VS Code и введи код вручную.</li>
  </ol>
</main>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
      "cache-control": "public, max-age=300",
    },
  });
}
