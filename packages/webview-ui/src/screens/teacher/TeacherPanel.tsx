import { useContext, useEffect, useState } from "react";
import { GameSettings, type GameKind, type HostToUi, type SessionSnapshot, type Task, type TaskSet } from "@codearena/shared";
import { TeacherLobby } from "../TeacherLobby.tsx";
import { GamePicker } from "./GamePicker.tsx";
import { QuizEditor } from "./QuizEditor.tsx";
import { TugEditor } from "./TugEditor.tsx";
import { TeacherGame } from "./TeacherGame.tsx";
import { readUiState, sampleQuiz, sampleTug, setSoundDefault, writeState } from "../../lib/game.ts";
import { LocaleContext } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { onHostMessage } from "../../lib/vscode.ts";

type View = "lobby" | "pick" | "edit-quiz" | "edit-tug";
const EMPTY: TaskSet = { version: 1, title: "", tasks: [] };

/**
 * Панель учителя: лобби → выбор игры → задания и настройки → игра → итоги.
 * Черновик заданий хранится в состоянии webview: переживает скрытие вкладки, но не её закрытие.
 */
export function TeacherPanel({ session }: { session: SessionSnapshot }) {
  // Панель учителя показывают на проекторе — там звук по умолчанию включён.
  setSoundDefault(true);
  const locale = useContext(LocaleContext);
  const [view, setView] = useState<View>("lobby");
  const [draft, setDraft] = useState<TaskSet>(() => readUiState().draft ?? EMPTY);
  const [draftTug, setDraftTug] = useState<TaskSet>(() => readUiState().draftTug ?? EMPTY);
  const [questionSec, setQuestionSec] = useState(() => readUiState().questionSec ?? 20);
  const [roundSec, setRoundSec] = useState(() => readUiState().roundSec ?? 180);
  const [wrongLockSec, setWrongLockSec] = useState(() => readUiState().wrongLockSec ?? 3);
  const [played, setPlayed] = useState<{ game: GameKind; tasks: Task[] } | null>(null);

  useEffect(() => writeState({ draft }), [draft]);
  useEffect(() => writeState({ draftTug }), [draftTug]);
  useEffect(() => writeState({ questionSec, roundSec, wrongLockSec }), [questionSec, roundSec, wrongLockSec]);
  const settings = () => GameSettings.parse({ questionSec, roundSec, wrongLockSec });

  // Набор заданий загружен из файла.
  useEffect(
    () =>
      onHostMessage<HostToUi>((m) => {
        // Загруженный файл попадает в редактор той игры, к которой подходят задания.
        if (m.type === "tasks_loaded") {
          if (m.set.tasks.every((x) => x.type === "short_answer")) setDraftTug(m.set);
          else setDraft(m.set);
        }
      }),
    [],
  );

  // После «Новой игры» (game = null) показывается лобби: start() уже переключил вид на него.
  const start = (game: GameKind, tasks: Task[]) => {
    setPlayed({ game, tasks });
    host.send({ type: "start_game", game, tasks, settings: settings() });
    setView("lobby");
  };

  if (session.game) {
    return (
      <TeacherGame
        session={session}
        tasks={played?.tasks ?? draft.tasks}
        onAgain={() => played && host.send({ type: "start_game", game: played.game, tasks: played.tasks, settings: settings() })}
      />
    );
  }

  if (view === "pick") {
    return (
      <GamePicker
        mode={session.lobby?.mode ?? "solo"}
        onBack={() => setView("lobby")}
        onPick={(g) => (g === "quiz" ? setView("edit-quiz") : g === "tug" ? setView("edit-tug") : undefined)}
      />
    );
  }

  if (view === "edit-tug") {
    return (
      <TugEditor
        set={draftTug}
        onChange={setDraftTug}
        roundSec={roundSec}
        onRoundSec={setRoundSec}
        wrongLockSec={wrongLockSec}
        onWrongLockSec={setWrongLockSec}
        canStart={session.lobby?.mode === "teams2"}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("tug", tasks)}
        onSample={() => setDraftTug(sampleTug(locale))}
        onLoad={() => host.post({ type: "load_tasks" })}
        onSave={() => host.post({ type: "save_tasks", set: draftTug })}
      />
    );
  }

  if (view === "edit-quiz") {
    return (
      <QuizEditor
        set={draft}
        onChange={setDraft}
        questionSec={questionSec}
        onQuestionSec={setQuestionSec}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("quiz", tasks)}
        onSample={() => setDraft(sampleQuiz(locale))}
        onLoad={() => host.post({ type: "load_tasks" })}
        onSave={() => host.post({ type: "save_tasks", set: draft })}
      />
    );
  }

  return <TeacherLobby session={session} onChooseGame={() => setView("pick")} />;
}
