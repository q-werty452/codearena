import * as vscode from "vscode";
import { lookup } from "node:dns/promises";
import WebSocket from "ws";
import { classify, fetchJson, type NetProblem } from "./net.ts";

/**
 * «CodeArena: Проверить соединение» — для сети колледжа, где «нет соединения»,
 * хотя YouTube открывается. По шагам: находится ли адрес сервера, открывается ли
 * HTTPS, проходит ли WebSocket, есть ли прокси. Итог — простыми словами и отчёт,
 * который можно отправить админу сети или в issues.
 */
const ru = () => vscode.env.language.toLowerCase().startsWith("ru");

const ADVICE: Record<NetProblem, () => string> = {
  dns: () => (ru() ? "Сеть не находит адрес сервера — скорее всего, сеть колледжа блокирует домен workers.dev. Попросите администратора сети открыть его или попробуйте другой интернет (раздача с телефона)." : "The network can't resolve the server — the college network probably blocks the workers.dev domain. Ask the network admin to allow it, or try another connection (phone hotspot)."),
  tls: () => (ru() ? "Сеть подменяет защищённое соединение (проверка трафика или прокси), и VS Code ей не доверяет. Нужно, чтобы администратор сети пропускал этот адрес без проверки." : "The network intercepts HTTPS (traffic inspection or proxy) and VS Code doesn't trust it. Ask the network admin to let this address through without inspection."),
  reset: () => (ru() ? "Сеть обрывает соединение с сервером — похоже на фильтр сети. Попросите администратора открыть адрес или попробуйте другой интернет." : "The network drops the connection to the server — looks like a network filter. Ask the admin to allow the address, or try another connection."),
  timeout: () => (ru() ? "Сервер не ответил за 15 секунд — сеть очень медленная или перегружена. Попробуйте ещё раз или подключитесь к другой точке Wi-Fi." : "The server didn't answer in 15 seconds — the network is very slow or overloaded. Try again or switch Wi-Fi."),
  portal: () => (ru() ? "Вместо сервера ответила страница сети. Откройте браузер — возможно, нужно войти в Wi-Fi колледжа, или сеть показывает страницу блокировки." : "A network page answered instead of the server. Open a browser — you may need to sign in to the college Wi-Fi, or the network shows a block page."),
  offline: () => (ru() ? "Нет подключения к интернету." : "No internet connection."),
  http: () => (ru() ? "Сервер ответил ошибкой. Попробуйте через минуту." : "The server returned an error. Try again in a minute."),
};

export async function diagnose(serverUrl: string): Promise<void> {
  const out = vscode.window.createOutputChannel(ru() ? "CodeArena: соединение" : "CodeArena: connection");
  const host = new URL(serverUrl).host;
  const lines: string[] = [];
  const log = (s: string) => {
    lines.push(s);
    out.appendLine(s);
  };
  let problem: NetProblem | null = null;
  const fail = (p: NetProblem) => (problem ??= p);

  await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: ru() ? "CodeArena: проверяю соединение…" : "CodeArena: checking the connection…" }, async () => {
    log(`CodeArena — ${new Date().toISOString()} — ${serverUrl}`);
    log(`VS Code ${vscode.version}, ${process.platform}`);
    const proxy = vscode.workspace.getConfiguration("http").get<string>("proxy");
    const envProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
    // Значение прокси может содержать пароль — показываем только факт.
    log(`${ru() ? "Прокси" : "Proxy"}: ${proxy ? "http.proxy" : envProxy ? "HTTPS_PROXY" : ru() ? "нет" : "none"}`);

    // 1. Адрес сервера.
    try {
      const t0 = Date.now();
      const a = await lookup(host);
      log(`1. DNS ${host} → ${a.address} (${Date.now() - t0} ms) ✓`);
    } catch (e) {
      const p = classify(e).problem;
      log(`1. DNS ${host} ✗ ${(e as { code?: string }).code ?? ""}`);
      fail(p === "offline" ? "offline" : "dns");
    }

    // 2. HTTPS до сервера.
    if (!problem) {
      try {
        const t0 = Date.now();
        const r = await fetchJson<{ ok?: boolean }>(`${serverUrl}/health`, {}, [15_000]);
        if (r.body?.ok) log(`2. HTTPS /health ✓ (${Date.now() - t0} ms)`);
        else {
          log(`2. HTTPS /health ✗ ${r.status}`);
          fail("http");
        }
      } catch (e) {
        const err = classify(e);
        log(`2. HTTPS /health ✗ ${err.problem} ${err.detail}`);
        fail(err.problem);
      }
    }

    // 3. WebSocket (живая связь игры): несуществующая комната должна ответить 404.
    if (!problem) {
      const t0 = Date.now();
      const res = await new Promise<string>((resolve) => {
        const ws = new WebSocket(`${serverUrl.replace(/^http/, "ws")}/rooms/000000/ws`, { handshakeTimeout: 15_000 });
        ws.on("unexpected-response", (_q, r) => {
          resolve(r.statusCode === 404 ? "ok" : `http ${r.statusCode}`);
          ws.terminate();
        });
        ws.on("open", () => {
          resolve("ok");
          ws.terminate();
        });
        ws.on("error", (e) => resolve(`error ${classify(e).problem}`));
      });
      if (res === "ok") log(`3. WebSocket ✓ (${Date.now() - t0} ms)`);
      else {
        log(`3. WebSocket ✗ ${res}`);
        fail(res.startsWith("error ") ? (res.slice(6) as NetProblem) : "reset");
      }
    }
  });

  const ok = !problem;
  const summary = ok
    ? ru()
      ? "Соединение с сервером CodeArena в порядке."
      : "The connection to the CodeArena server is fine."
    : ADVICE[problem!]();
  log("");
  log((ru() ? "Итог: " : "Result: ") + summary);

  const openLog = ru() ? "Открыть отчёт" : "Open report";
  const copy = ru() ? "Скопировать отчёт" : "Copy report";
  const browser = ru() ? "Открыть сервер в браузере" : "Open the server in a browser";
  const pick = ok ? await vscode.window.showInformationMessage(summary, openLog) : await vscode.window.showWarningMessage(summary, browser, copy, openLog);
  if (pick === openLog) out.show(true);
  if (pick === copy) await vscode.env.clipboard.writeText(lines.join("\n"));
  if (pick === browser) await vscode.env.openExternal(vscode.Uri.parse(`${serverUrl}/health`));
}
