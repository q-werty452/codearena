import { useEffect, useState } from "react";
import { JoinScreen } from "./screens/Join.tsx";
import { onHostMessage, vscode } from "./lib/vscode.ts";

type HostMessage = { type: "prefill"; code: string };

/**
 * Корень webview. На этапе 1 — экран входа; лобби и игры подключаются
 * на следующих этапах через сообщения от расширения.
 */
export function App({ view }: { view: "sidebar" | "panel" }) {
  const [code, setCode] = useState("");

  // Пришёл по ссылке vscode://…/join?code= — код уже заполнен.
  useEffect(() => {
    const off = onHostMessage<HostMessage>((m) => {
      if (m.type === "prefill") setCode(m.code);
    });
    vscode.postMessage({ type: "ready" });
    return off;
  }, []);

  if (view === "sidebar") {
    return (
      <JoinScreen
        key={code}
        initialCode={code}
        onJoin={(c, name) => vscode.postMessage({ type: "join", code: c, name })}
        onTeacher={() => vscode.postMessage({ type: "create_room" })}
      />
    );
  }
  return <div className="flex h-full items-center justify-center text-muted">CodeArena</div>;
}
