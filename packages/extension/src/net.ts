/**
 * Сеть до сервера CodeArena на слабом или «фильтрующем» Wi-Fi.
 * Запросы — с повторами и долгими таймаутами (медленная сеть колледжа),
 * а ошибка — с причиной, понятной учителю: сервер не находится, сеть подменяет
 * HTTPS, обрывает соединение, отвечает своей страницей вместо сервера или просто медленная.
 */

export type NetProblem =
  | "dns" // адрес сервера не находится — часто его блокирует сеть
  | "tls" // сеть подменяет защищённое соединение (проверка трафика, прокси)
  | "reset" // сеть обрывает соединение — похоже на фильтр
  | "timeout" // сервер не ответил даже за 20 секунд
  | "portal" // вместо сервера ответила страница сети (вход в Wi-Fi, фильтр)
  | "offline" // нет сети вообще
  | "http"; // сервер ответил ошибкой

export class NetError extends Error {
  constructor(
    readonly problem: NetProblem,
    readonly detail: string,
  ) {
    super(`${problem}: ${detail}`);
  }
}

const TLS_CODES = /CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_(GET|VERIFY)|DEPTH_ZERO|ERR_TLS/i;

/** Ошибка fetch/ws → причина. У Node fetch код лежит в e.cause.code. */
export function classify(e: unknown): NetError {
  if (e instanceof NetError) return e;
  const err = e as { name?: string; message?: string; code?: string; cause?: { code?: string; message?: string; name?: string } };
  const code = err.cause?.code ?? err.code ?? "";
  const text = `${err.name ?? ""} ${err.message ?? ""} ${err.cause?.name ?? ""} ${err.cause?.message ?? ""} ${code}`;
  if (err.name === "TimeoutError" || err.name === "AbortError" || /timeout|timed out|UND_ERR_CONNECT_TIMEOUT|ETIMEDOUT/i.test(text)) return new NetError("timeout", code || "timeout");
  if (/ENOTFOUND|EAI_AGAIN|EAI_NONAME|getaddrinfo/i.test(text)) return new NetError(/EAI_AGAIN/.test(text) ? "offline" : "dns", code || "ENOTFOUND");
  if (TLS_CODES.test(code) || /certificate|self.signed|ssl|tls/i.test(text)) return new NetError("tls", code || "certificate");
  if (/ECONNRESET|ECONNREFUSED|EPIPE|socket hang up|UND_ERR_SOCKET|other side closed/i.test(text)) return new NetError("reset", code || "reset");
  if (/ENETUNREACH|EHOSTUNREACH|ENETDOWN/i.test(text)) return new NetError("offline", code);
  return new NetError("reset", code || (err.message ?? "fetch failed").slice(0, 80));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Таймаут каждой попытки: медленная сеть получает шанс, но ученик не ждёт вечно. */
const ATTEMPT_TIMEOUTS = [10_000, 15_000, 20_000];

/**
 * JSON с сервера CodeArena: до трёх попыток (10, 15, 20 с) с паузой между ними.
 * Повторяет только сетевые сбои и 5xx; 429 и 4xx отдаёт сразу как есть.
 */
export async function fetchJson<T>(url: string, init: RequestInit = {}, attempts = ATTEMPT_TIMEOUTS): Promise<{ status: number; body: T | null }> {
  let last: NetError = new NetError("timeout", "no attempts");
  for (let i = 0; i < attempts.length; i++) {
    try {
      const r = await fetch(url, { ...init, signal: AbortSignal.timeout(attempts[i]!) });
      if (r.status >= 500 && i < attempts.length - 1) {
        last = new NetError("http", String(r.status));
        await sleep(800 * (i + 1));
        continue;
      }
      const text = await r.text();
      // Страница входа в Wi-Fi или фильтра отдаёт HTML вместо нашего JSON.
      if (/^\s*</.test(text)) throw new NetError("portal", `${r.status} html`);
      let body: T | null = null;
      try {
        body = text ? (JSON.parse(text) as T) : null;
      } catch {
        throw new NetError("portal", `${r.status} not json`);
      }
      return { status: r.status, body };
    } catch (e) {
      last = classify(e);
      // Подмену сертификата и страницу сети повтор не вылечит.
      if (last.problem === "tls" || last.problem === "portal") throw last;
      if (i < attempts.length - 1) await sleep(800 * (i + 1));
    }
  }
  throw last;
}
