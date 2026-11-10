import type { SessionSnapshot } from "@codearena/shared";
import { JoinScreen } from "./screens/Join.tsx";
import { StudentLobby } from "./screens/StudentLobby.tsx";
import { TeacherPanel } from "./screens/teacher/TeacherPanel.tsx";
import { StudentGame, StudentGameSidebar } from "./screens/StudentGame.tsx";
import { TeacherSidebar } from "./screens/TeacherSidebar.tsx";
import { EndedScreen } from "./screens/Ended.tsx";
import { ConnectionBanner } from "./ui/Controls.tsx";
import { Skeleton } from "./ui/Card.tsx";
import { Toast } from "./ui/Status.tsx";
import { useT } from "./lib/i18n.ts";
import { host, useHostSession } from "./lib/session.ts";

/** Корень webview: выбирает экран по снимку сессии от расширения. */
export function App({ view }: { view: "sidebar" | "panel" }) {
  const { session, prefill, toast, dismissToast } = useHostSession();
  const t = useT();

  return (
    <>
      <ConnectionBanner show={session.status === "reconnecting"} text={t("net.lost")} />
      <Screen view={view} session={session} prefill={prefill} />
      <Toast toast={toast} onDone={dismissToast} />
    </>
  );
}

export function Screen({ view, session, prefill }: { view: "sidebar" | "panel"; session: SessionSnapshot; prefill: string }) {
  const t = useT();

  if (session.ended) {
    return <EndedScreen reason={session.ended} onAgain={() => host.post({ type: "leave" })} />;
  }

  if (session.role === "teacher") {
    if (!session.lobby) return <LoadingScreen />;
    return view === "panel" ? <TeacherPanel session={session} /> : <TeacherSidebar session={session} />;
  }

  if (session.role === "student" && session.me) {
    if (session.game) return view === "panel" ? <StudentGame session={session} /> : <StudentGameSidebar session={session} />;
    return view === "sidebar" ? <StudentLobby session={session} onLeave={() => host.post({ type: "leave" })} /> : <PanelIdle />;
  }

  if (view === "panel") return session.busy ? <LoadingScreen /> : <PanelIdle />;

  const err = session.error;
  return (
    <JoinScreen
      key={prefill || "join"}
      initialCode={prefill}
      initialName={session.savedName}
      busy={session.busy || (session.role === "student" && session.status === "connecting")}
      codeError={err?.field === "code" ? t("join.badCode") : null}
      nameError={err?.field === "name" ? t("join.nameTaken") : null}
      generalError={err?.field === "general" ? (err.message === "too_many" ? t("join.tooMany") : t("join.offline")) : null}
      onJoin={(code, name) => host.post({ type: "join", code, name })}
      onTeacher={() => host.post({ type: "create_room" })}
    />
  );
}

function LoadingScreen() {
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4 p-6">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-40 w-full" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
        <Skeleton className="h-52" />
      </div>
    </div>
  );
}

function PanelIdle() {
  return <div className="flex h-full items-center justify-center text-muted">CodeArena</div>;
}
