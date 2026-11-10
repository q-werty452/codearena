import { useContext, useEffect, useState } from "react";
import { GameSettings, type GameKind, type HostToUi, type SessionSnapshot, type Task, type TaskSet } from "@codearena/shared";
import { TeacherLobby } from "../TeacherLobby.tsx";
import { GamePicker } from "./GamePicker.tsx";
import { QuizEditor } from "./QuizEditor.tsx";
import { TugEditor } from "./TugEditor.tsx";
import { CodeEditor } from "./CodeEditor.tsx";
import { BugEditor } from "./BugEditor.tsx";
import { RaceEditor } from "./RaceEditor.tsx";
import { BankDialog } from "../../ui/BankDialog.tsx";
import { bankFor } from "../../lib/bank.ts";
import { TeacherGame } from "./TeacherGame.tsx";
import { readUiState, sampleCodewars, sampleQuiz, sampleTug, setSoundDefault, writeState } from "../../lib/game.ts";
import { LocaleContext } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { onHostMessage } from "../../lib/vscode.ts";

type View = "lobby" | "pick" | "edit-quiz" | "edit-tug" | "edit-codewars" | "edit-bug" | "edit-race";
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
  const [draftCode, setDraftCode] = useState<TaskSet>(() => readUiState().draftCode ?? EMPTY);
  const [draftBug, setDraftBug] = useState<TaskSet>(() => readUiState().draftBug ?? EMPTY);
  const [draftRace, setDraftRace] = useState<TaskSet>(() => readUiState().draftRace ?? EMPTY);
  const [raceLength, setRaceLength] = useState(() => readUiState().raceLength ?? 10);
  const [bankOpen, setBankOpen] = useState(false);
  const [questionSec, setQuestionSec] = useState(() => readUiState().questionSec ?? 20);
  const [roundSec, setRoundSec] = useState(() => readUiState().roundSec ?? 180);
  const [wrongLockSec, setWrongLockSec] = useState(() => readUiState().wrongLockSec ?? 3);
  const [played, setPlayed] = useState<{ game: GameKind; tasks: Task[] } | null>(null);

  useEffect(() => writeState({ draft }), [draft]);
  useEffect(() => writeState({ draftTug }), [draftTug]);
  useEffect(() => writeState({ draftCode }), [draftCode]);
  useEffect(() => writeState({ draftBug }), [draftBug]);
  useEffect(() => writeState({ draftRace, raceLength }), [draftRace, raceLength]);
  useEffect(() => writeState({ questionSec, roundSec, wrongLockSec }), [questionSec, roundSec, wrongLockSec]);
  const settings = (game?: GameKind) =>
    GameSettings.parse({ questionSec, roundSec: game === "race" ? Math.max(roundSec, 180) : roundSec, wrongLockSec, raceLength });

  // Набор заданий загружен из файла.
  useEffect(
    () =>
      onHostMessage<HostToUi>((m) => {
        // Загруженный файл попадает в редактор той игры, к которой подходят задания.
        if (m.type === "tasks_loaded") {
          const all = (...types: string[]) => m.set.tasks.every((x) => types.includes(x.type));
          if (m.set.game === "race") setDraftRace(m.set);
          else if (all("short_answer")) setDraftTug(m.set);
          else if (all("code")) setDraftCode(m.set);
          else if (all("find_line", "fix_bug", "best_variant")) setDraftBug(m.set);
          else if (all("choice")) setDraft(m.set);
          else if (all("short_answer", "choice", "code")) setDraftRace(m.set);
        }
      }),
    [],
  );

  // После «Новой игры» (game = null) показывается лобби: start() уже переключил вид на него.
  const start = (game: GameKind, tasks: Task[]) => {
    setPlayed({ game, tasks });
    host.send({ type: "start_game", game, tasks, settings: settings(game) });
    setView("lobby");
  };

  if (session.game) {
    return (
      <TeacherGame
        session={session}
        tasks={played?.tasks ?? draft.tasks}
        onAgain={() => played && host.send({ type: "start_game", game: played.game, tasks: played.tasks, settings: settings(played.game) })}
      />
    );
  }

  if (view === "pick") {
    return (
      <GamePicker
        mode={session.lobby?.mode ?? "solo"}
        onBack={() => setView("lobby")}
        onPick={(g) => setView(`edit-${g}`)}
      />
    );
  }

  // Банк задач: добавить набор к черновику текущего редактора.
  const editors = {
    "edit-quiz": { game: "quiz", draft: draft, set: setDraft },
    "edit-tug": { game: "tug", draft: draftTug, set: setDraftTug },
    "edit-codewars": { game: "codewars", draft: draftCode, set: setDraftCode },
    "edit-bug": { game: "bug", draft: draftBug, set: setDraftBug },
    "edit-race": { game: "race", draft: draftRace, set: setDraftRace },
  } as const;
  const ed = view in editors ? editors[view as keyof typeof editors] : null;
  const bank = ed && (
    <BankDialog
      game={ed.game}
      open={bankOpen}
      onClose={() => setBankOpen(false)}
      onAdd={(tasks, title) => ed.set({ ...ed.draft, title: ed.draft.title || title, tasks: [...ed.draft.tasks, ...tasks] })}
    />
  );
  const onBank = ed && bankFor(ed.game).length > 0 ? () => setBankOpen(true) : undefined;

  if (view === "edit-race") {
    // Пример гонки: короткие ответы, вопросы и пара задач с кодом из банка.
    const sample = () => {
      const pick = (game: GameKind, n: number) => bankFor(game).find((b) => b.id.startsWith("html-css"))?.set.tasks.slice(0, n) ?? [];
      setDraftRace({ version: 1, title: locale === "ru" ? "Гонка: HTML и CSS" : "Race: HTML and CSS", tasks: [...pick("tug", 4), ...pick("quiz", 4), ...pick("codewars", 2)] });
    };
    return (
      <>
        <RaceEditor
          set={draftRace}
          onChange={setDraftRace}
          raceLength={raceLength}
          onRaceLength={setRaceLength}
          roundSec={Math.max(roundSec, 180)}
          onRoundSec={setRoundSec}
          wrongLockSec={wrongLockSec}
          onWrongLockSec={setWrongLockSec}
          onBack={() => setView("pick")}
          onStart={(tasks) => start("race", tasks)}
          onSample={sample}
          onBank={onBank}
          onLoad={() => host.post({ type: "load_tasks" })}
          onSave={() => host.post({ type: "save_tasks", set: { ...draftRace, game: "race" } })}
        />
        {bank}
      </>
    );
  }

  if (view === "edit-bug") {
    return (
      <>
        <BugEditor
          set={draftBug}
          onChange={setDraftBug}
          questionSec={questionSec}
          onQuestionSec={setQuestionSec}
          onBack={() => setView("pick")}
          onStart={(tasks) => start("bug", tasks)}
          onSample={() => setDraftBug({ ...bankFor("bug")[0]!.set, tasks: bankFor("bug")[0]!.set.tasks.slice(0, 6) })}
          onBank={() => setBankOpen(true)}
          onLoad={() => host.post({ type: "load_tasks" })}
          onSave={() => host.post({ type: "save_tasks", set: { ...draftBug, game: "bug" } })}
        />
        {bank}
      </>
    );
  }

  if (view === "edit-codewars") {
    return (
      <>
      <CodeEditor
        onBank={onBank}
        set={draftCode}
        onChange={setDraftCode}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("codewars", tasks)}
        onSample={() => setDraftCode(sampleCodewars(locale))}
        onLoad={() => host.post({ type: "load_tasks" })}
        onSave={() => host.post({ type: "save_tasks", set: { ...draftCode, game: "codewars" } })}
      />
      {bank}
      </>
    );
  }

  if (view === "edit-tug") {
    return (
      <>
      <TugEditor
        onBank={onBank}
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
        onSave={() => host.post({ type: "save_tasks", set: { ...draftTug, game: "tug" } })}
      />
      {bank}
      </>
    );
  }

  if (view === "edit-quiz") {
    return (
      <>
      <QuizEditor
        onBank={onBank}
        set={draft}
        onChange={setDraft}
        questionSec={questionSec}
        onQuestionSec={setQuestionSec}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("quiz", tasks)}
        onSample={() => setDraft(sampleQuiz(locale))}
        onLoad={() => host.post({ type: "load_tasks" })}
        onSave={() => host.post({ type: "save_tasks", set: { ...draft, game: "quiz" } })}
      />
      {bank}
      </>
    );
  }

  return <TeacherLobby session={session} onChooseGame={() => setView("pick")} />;
}
