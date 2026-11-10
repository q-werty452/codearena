/** Мост webview ↔ расширение. В браузере (dev) — заглушка, пишущая в консоль. */
interface VsCodeApi {
  postMessage(msg: unknown): void;
  getState<T>(): T | undefined;
  setState<T>(s: T): void;
}

declare function acquireVsCodeApi(): VsCodeApi;

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
        getState: () => undefined,
        setState: () => {},
      };

export function onHostMessage<T = unknown>(fn: (msg: T) => void): () => void {
  const h = (e: MessageEvent) => fn(e.data as T);
  window.addEventListener("message", h);
  return () => window.removeEventListener("message", h);
}
