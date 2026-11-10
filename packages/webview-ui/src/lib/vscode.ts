/** Мост webview ↔ расширение. В браузере (dev) — заглушка, пишущая в консоль. */
interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  /** В VS Code возвращает новое состояние. */
  setState<T>(s: T): T;
}

declare function acquireVsCodeApi(): VsCodeApi;

let devState: unknown;

export const vscode: VsCodeApi =
  typeof acquireVsCodeApi === "function"
    ? acquireVsCodeApi()
    : {
        // В браузере (dev) сообщения уходят в поддельное расширение, если оно есть.
        postMessage: (m) => {
          const dev = (window as { __caDevHost?: (m: unknown) => void }).__caDevHost;
          if (dev) dev(m);
          else console.log("[webview → ext]", m);
        },
        // Как в VS Code: состояние хранится, setState возвращает его (иначе витрина не ловит ошибки вида «useEffect вернул объект»).
        getState: <T,>() => devState as T | undefined,
        setState: <T,>(st: T) => ((devState = st), st),
      };

export function onHostMessage<T = unknown>(fn: (msg: T) => void): () => void {
  const h = (e: MessageEvent) => fn(e.data as T);
  window.addEventListener("message", h);
  return () => window.removeEventListener("message", h);
}
