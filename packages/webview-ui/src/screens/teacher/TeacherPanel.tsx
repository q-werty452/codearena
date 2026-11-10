import { useContext, useEffect, useState } from "react";
import { GameSettings, type GameKind, type HostToUi, type SessionSnapshot, type Task, type TaskSet } from "@codearena/shared";
import { TeacherLobby } from "../TeacherLobby.tsx";
import { GamePicker } from "./GamePicker.tsx";
import { QuizEditor } from "./QuizEditor.tsx";
import { TeacherGame } from "./TeacherGame.tsx";
import { readUiState, sampleQuiz, setSoundDefault, writeState } from "../../lib/game.ts";
import { LocaleContext } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { onHostMessage } from "../../lib/vscode.ts";

type View = "lobby" | "pick" | "edit";

/**
 * Панель учителя: лобби → выбор игры → задания и настройки → игра → итоги.
 * Черновик заданий хранится в состоянии webview: переживает скрытие вкладки, но не её закрытие.
 */
export function TeacherPanel({ session }: { session: SessionSnapshot }) {
  // Панель учителя показывают на проекторе — там звук по умолчанию включён.
  setSoundDefault(true);
  const locale = useContext(LocaleContext);
  const [view, setView] = useState<View>("lobby");
  const [draft, setDraft] = useState<TaskSet>(() => readUiState().draft ?? { version: 1, title: "", tasks: [] });
  const [questionSec, setQuestionSec] = useState(() => readUiState().questionSec ?? 20);
  const [played, setPlayed] = useState<{ game: GameKind; tasks: Task[] } | null>(null);

  useEffect(() => writeState({ draft }), [draft]);
  useEffect(() => writeState({ questionSec }), [questionSec]);

  // Набор заданий загружен из файла.
  useEffect(
    () =>
      onHostMessage<HostToUi>((m) => {
        if (m.type === "tasks_loaded") setDraft(m.set);
      }),
    [],
  );

  // Игра закончилась и учитель нажал «Новая игра» — назад в лобби.
  const inGame = session.game !== null;
  useEffect(() => {
    if (!inGame) setView((v) => (v === "edit" || v === "pick" ? v : "lobby"));
  }, [inGame]);

  const start = (game: GameKind, tasks: Task[]) => {
    setPlayed({ game, tasks });
    host.send({ type: "start_game", game, tasks, settings: GameSettings.parse({ questionSec }) });
    setView("lobby");
  };

  if (session.game) {
    return (
      <TeacherGame
        session={session}
        tasks={played?.tasks ?? draft.tasks}
        onAgain={() => played && host.send({ type: "start_game", game: played.game, tasks: played.tasks, settings: GameSettings.parse({ questionSec }) })}
      />
    );
  }

  if (view === "pick") {
    return (
      <GamePicker
        mode={session.lobby?.mode ?? "solo"}
        onBack={() => setView("lobby")}
        onPick={(g) => g === "quiz" && setView("edit")}
      />
    );
  }

  if (view === "edit") {
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
