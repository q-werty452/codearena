import { useCallback, useEffect, useState } from "react";
import { EMPTY_SESSION, type ClientMessage, type HostToUi, type SessionSnapshot, type UiToHost } from "@codearena/shared";
import { onHostMessage, vscode } from "./vscode.ts";

export const host = {
  post: (m: UiToHost) => vscode.postMessage(m),
  send: (msg: ClientMessage) => vscode.postMessage({ type: "send", msg } satisfies UiToHost),
};

/** Снимок сессии от расширения + одноразовые события (prefill, toast). */
export function useHostSession() {
  const [session, setSession] = useState<SessionSnapshot>(EMPTY_SESSION);
  const [prefill, setPrefill] = useState("");
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  useEffect(() => {
    const off = onHostMessage<HostToUi>((m) => {
      if (m.type === "session") setSession(m.session);
      else if (m.type === "prefill") setPrefill(m.code);
      else if (m.type === "toast") setToast({ id: Date.now(), text: m.text });
    });
    host.post({ type: "ready" });
    return off;
  }, []);

  const dismissToast = useCallback(() => setToast(null), []);
  return { session, prefill, toast, dismissToast };
}
