import { useContext, useEffect, useRef, useState } from "react";
import { AntiCheatSettings, GameSettings, type AiRequest, type GameKind, type SessionSnapshot, type Task, type TaskSet } from "@codearena/shared";
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
import { clearImportResult, mergeTasks, tasksFor, useMyTasks } from "../../lib/myTasks.ts";
import { AiDialog, ImportResultDialog, MyTasksCard, PasteDialog } from "./MyTasksDialogs.tsx";

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
  const [antiCheat, setAntiCheat] = useState<AntiCheatSettings>(() => readUiState().antiCheat ?? AntiCheatSettings.parse({}));
  const [bankOpen, setBankOpen] = useState(false);
  const [questionSec, setQuestionSec] = useState(() => readUiState().questionSec ?? 20);
  const [roundSec, setRoundSec] = useState(() => readUiState().roundSec ?? 180);
  const [wrongLockSec, setWrongLockSec] = useState(() => readUiState().wrongLockSec ?? 3);
  const [played, setPlayed] = useState<{ game: GameKind; tasks: Task[] } | null>(null);

  useEffect(() => { writeState({ draft }); }, [draft]);
  useEffect(() => { writeState({ draftTug }); }, [draftTug]);
  useEffect(() => { writeState({ draftCode }); }, [draftCode]);
  useEffect(() => { writeState({ draftBug }); }, [draftBug]);
  useEffect(() => { writeState({ draftRace, raceLength }); }, [draftRace, raceLength]);
  useEffect(() => { writeState({ antiCheat }); }, [antiCheat]);
  useEffect(() => { writeState({ questionSec, roundSec, wrongLockSec }); }, [questionSec, roundSec, wrongLockSec]);
  const settings = (game?: GameKind) =>
    GameSettings.parse({ questionSec, roundSec: game === "race" ? Math.max(roundSec, 180) : roundSec, wrongLockSec, raceLength, antiCheat });

  // Свои задания (файл, вставка, ИИ) — раскладываются по черновикам игр.
  const [pasteOpen, setPasteOpen] = useState(false);
  const [aiGame, setAiGame] = useState<AiRequest["game"] | null>(null);
  const { result, sets: mySets } = useMyTasks();
  const applied = useRef(0);
  const setters: Record<GameKind, (f: (s: TaskSet) => TaskSet) => void> = { quiz: setDraft, tug: setDraftTug, codewars: setDraftCode, bug: setDraftBug, race: setDraftRace };
  useEffect(() => {
    if (!result || result.id === applied.current) return;
    applied.current = result.id;
    for (const [g, tasks] of Object.entries(result.result.byGame) as [GameKind, Task[]][]) {
      setters[g]((s) => ({ ...s, title: s.title || result.result.title, tasks: mergeTasks(s.tasks, tasks) }));
    }
    if (result.result.source === "ai" && !result.result.unrecognized) setAiGame(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  const importTasks = () => host.post({ type: "import_tasks" });
  const myDialogs = (
    <>
      <ImportResultDialog
        result={result?.result ?? null}
        onClose={clearImportResult}
        onOpenGame={(g) => {
          clearImportResult();
          setView(`edit-${g}`);
        }}
      />
      <PasteDialog open={pasteOpen} onClose={() => setPasteOpen(false)} />
      <AiDialog open={aiGame !== null} game={aiGame ?? "quiz"} onClose={() => setAiGame(null)} />
    </>
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
      <>
      {myDialogs}
      <GamePicker
        mode={session.lobby?.mode ?? "solo"}
        onBack={() => setView("lobby")}
        onPick={(g) => setView(`edit-${g}`)}
        antiCheat={antiCheat}
        onAntiCheat={setAntiCheat}
        extra={<MyTasksCard onPaste={() => setPasteOpen(true)} onAi={() => setAiGame("quiz")} />}
      />
      </>
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
  const onBank = ed && (bankFor(ed.game).length > 0 || mySets.some((m) => tasksFor(m, ed.game).length)) ? () => setBankOpen(true) : undefined;

  if (view === "edit-race") {
    // Пример гонки: короткие ответы, вопросы и пара задач с кодом из банка.
    const sample = () => {
      const pick = (game: GameKind, n: number) => bankFor(game).find((b) => b.id.startsWith("html-css"))?.set.tasks.slice(0, n) ?? [];
      setDraftRace({ version: 1, title: locale === "ru" ? "Гонка: HTML и CSS" : "Race: HTML and CSS", tasks: [...pick("tug", 4), ...pick("quiz", 4), ...pick("codewars", 2)] });
    };
    return (
      <>
        <RaceEditor
          onAi={() => setAiGame("race")}
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
          onLoad={importTasks}
          onSave={() => host.post({ type: "save_tasks", set: { ...draftRace, game: "race" } })}
        />
        {bank}
        {myDialogs}
      </>
    );
  }

  if (view === "edit-bug") {
    return (
      <>
        <BugEditor
          onAi={() => setAiGame("bug")}
          set={draftBug}
          onChange={setDraftBug}
          questionSec={questionSec}
          onQuestionSec={setQuestionSec}
          onBack={() => setView("pick")}
          onStart={(tasks) => start("bug", tasks)}
          onSample={() => setDraftBug({ ...bankFor("bug")[0]!.set, tasks: bankFor("bug")[0]!.set.tasks.slice(0, 6) })}
          onBank={() => setBankOpen(true)}
          onLoad={importTasks}
          onSave={() => host.post({ type: "save_tasks", set: { ...draftBug, game: "bug" } })}
        />
        {bank}
        {myDialogs}
      </>
    );
  }

  if (view === "edit-codewars") {
    return (
      <>
      <CodeEditor
        onAi={() => setAiGame("codewars")}
        onBank={onBank}
        set={draftCode}
        onChange={setDraftCode}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("codewars", tasks)}
        onSample={() => setDraftCode(sampleCodewars(locale))}
        onLoad={importTasks}
        onSave={() => host.post({ type: "save_tasks", set: { ...draftCode, game: "codewars" } })}
      />
      {bank}
      {myDialogs}
      </>
    );
  }

  if (view === "edit-tug") {
    return (
      <>
      <TugEditor
        onAi={() => setAiGame("tug")}
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
        onLoad={importTasks}
        onSave={() => host.post({ type: "save_tasks", set: { ...draftTug, game: "tug" } })}
      />
      {bank}
      {myDialogs}
      </>
    );
  }

  if (view === "edit-quiz") {
    return (
      <>
      <QuizEditor
        onAi={() => setAiGame("quiz")}
        onBank={onBank}
        set={draft}
        onChange={setDraft}
        questionSec={questionSec}
        onQuestionSec={setQuestionSec}
        onBack={() => setView("pick")}
        onStart={(tasks) => start("quiz", tasks)}
        onSample={() => setDraft(sampleQuiz(locale))}
        onLoad={importTasks}
        onSave={() => host.post({ type: "save_tasks", set: { ...draft, game: "quiz" } })}
      />
      {bank}
      {myDialogs}
      </>
    );
  }

  return <TeacherLobby session={session} onChooseGame={() => setView("pick")} />;
}
