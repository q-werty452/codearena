/**
 * «Смотреть с телефона»: ссылка только для просмотра урока и игры.
 * Токен наблюдателя выводится из токена учителя (SHA-256), поэтому сам токен
 * учителя никуда не уходит, а сервер проверяет наблюдателя без лишнего хранения.
 * По токену наблюдателя нельзя управлять комнатой — сервер игнорирует его сообщения.
 */
// shared собирается без DOM/Node типов; WebCrypto и TextEncoder есть и в Workers, и в Node, и в браузере.
declare const crypto: { subtle: { digest(algorithm: string, data: Uint8Array): Promise<ArrayBuffer> } };
declare const TextEncoder: { new (): { encode(input: string): Uint8Array } };

export async function watchToken(teacherToken: string): Promise<string> {
  const data = new TextEncoder().encode("codearena-watch:" + teacherToken);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  return Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Ссылка для телефона. Токен — во фрагменте (#), он не попадает в логи запросов страницы. */
export function watchUrl(serverUrl: string, code: string, token: string): string {
  return `${serverUrl.replace(/\/+$/, "")}/w/${code}#t=${token}`;
}
