/**
 * Протокол между расширением (host) и его webview.
 * Соединение с сервером держит расширение, а webview получает готовый
 * снимок сессии и только рисует его. Так боковая панель и панель игры
 * всегда показывают одно и то же.
 */
import type {
  ClientMessage,
  LessonStatus,
  GameKind,
  GameSettings,
  GameState,
  LeaderRow,
  ServerMessage,
  TeamInfo,
  PlayerInfo,
  TeamMode,
  TeamIndex,
} from "./protocol.ts";
import type { HtmlRule, Language, PublicTask, TaskSet } from "./tasks.ts";
import type { TestReport } from "./protocol.ts";

/** Результат одного теста при локальном запуске (у ученика или учителя). */
export interface TestResult {
  call: string;
  expected: string;
  got?: string;
  ok: boolean;
}

/** Локальный прогон кода: идёт, готов, или ошибка окружения. */
export interface LocalRun {
  taskId: string;
  running: boolean;
  results: TestResult[];
  /** no_python / no_runtime — нет интерпретатора; timeout — дольше 5 с; compile — ошибка в коде. */
  error: null | "no_python" | "no_runtime" | "timeout" | "compile";
  message?: string;
  /** Отправлен ли этот прогон на сервер (а не просто «Запустить тесты»). */
  submitted: boolean;
}

/** Отправка ученика глазами учителя. */
export interface Submission {
  correct: boolean;
  code?: string;
  report?: TestReport;
  answer?: unknown;
  at: number;
  attempts: number;
}

export interface SolutionView {
  playerId: string;
  name: string;
  code: string;
  length: number;
}

export type Role = "none" | "student" | "teacher";
export type ConnStatus = "idle" | "connecting" | "online" | "reconnecting";

export interface LobbySnapshot {
  code: string;
  mode: TeamMode;
  teams: TeamInfo[];
  players: PlayerInfo[];
}

/** Состояние игры глазами клиента. Все времена — по локальным часам. */
export interface GameSnapshot {
  kind: GameKind;
  settings: GameSettings;
  phase: GameState["phase"];
  index: number;
  count: number;
  deadline: number | null;
  limitMs: number | null;
  pausedLeftMs: number | null;
  task: (PublicTask & { id: string }) | null;
  /** Мой ответ на текущее задание (сервер подтвердил). */
  myAnswer: number | string | null;
  reveal: { answer: unknown; explanation?: string; stats?: number[]; solutions?: SolutionView[] } | null;
  result: { correct: boolean; points: number; place: number | null } | null;
  leaders: LeaderRow[];
  teamScores: number[];
  answered: number;
  total: number;
  /** Канат: позиция −5…+5, кто последним дёрнул, победитель. */
  rope: number;
  lastPull: GameState["lastPull"];
  winner: TeamIndex | null;
  /** До какого момента мой ввод заблокирован после ошибки (локальные часы). */
  lockedUntil: number | null;
  /** Учитель: отправки учеников по текущему заданию (включая неправильные). */
  submissions: Record<string, Submission>;
  /** Ученик: локальный прогон тестов по текущему заданию. */
  localRun: LocalRun | null;
}

/** Урок глазами клиента. У учителя — статусы всех, у ученика — свой. */
export interface LessonSnapshot {
  checkpoint: number;
  statuses: Record<string, LessonStatus>;
  confused: number;
  progress: Record<string, number>;
  myStatus: LessonStatus;
  iConfused: boolean;
}

export const EMPTY_LESSON: LessonSnapshot = { checkpoint: 0, statuses: {}, confused: 0, progress: {}, myStatus: "writing", iConfused: false };

export interface SessionSnapshot {
  role: Role;
  status: ConnStatus;
  code: string | null;
  /** Ссылка-приглашение (для учителя). */
  link: string | null;
  /** Веб-ссылка, которую удобно кидать в мессенджер. */
  webLink: string | null;
  me: { playerId: string; name: string; team: TeamIndex | null } | null;
  lobby: LobbySnapshot | null;
  /** Последнее сохранённое имя ученика — поле уже заполнено. */
  savedName: string;
  error: { field: "code" | "name" | "general"; message: string } | null;
  /** Конечные состояния, показываются отдельным экраном. */
  ended: null | "kicked" | "room_closed";
  busy: boolean;
  game: GameSnapshot | null;
  lesson: LessonSnapshot;
}

export const EMPTY_SESSION: SessionSnapshot = {
  role: "none",
  status: "idle",
  code: null,
  link: null,
  webLink: null,
  me: null,
  lobby: null,
  savedName: "",
  error: null,
  ended: null,
  busy: false,
  game: null,
  lesson: EMPTY_LESSON,
};

/** webview → расширение */
export type UiToHost =
  | { type: "ready" }
  | { type: "join"; code: string; name: string }
  | { type: "create_room" }
  | { type: "leave" }
  | { type: "open_panel" }
  | { type: "copy"; text: string }
  /** Команды учителя серверу (расширение проверяет роль и схему). */
  | { type: "send"; msg: ClientMessage }
  /** Ответ ученика на текущее задание. */
  | { type: "answer"; taskId: string; answer: number | string }
  /** Урок: статус ученика и анонимное «объясните ещё раз». */
  | { type: "lesson_status"; status: LessonStatus }
  | { type: "lesson_confused" }
  /** Набор заданий учителя: сохранить в файл / загрузить из файла. */
  | { type: "save_tasks"; set: TaskSet }
  | { type: "load_tasks" }
  /** Codewars у ученика: открыть файл задачи, прогнать тесты, отправить. */
  | { type: "open_task_file" }
  | { type: "run_tests" }
  | { type: "submit_code" }
  /** Учитель проверяет эталонное решение своей задачи. */
  | { type: "check_code"; requestId: string; language: Language; code: string; tests: { call: string; expected: string }[]; rules: HtmlRule[] };

/** расширение → webview */
export type HostToUi =
  | { type: "session"; session: SessionSnapshot }
  | { type: "prefill"; code: string }
  | { type: "server"; msg: ServerMessage }
  | { type: "toast"; text: string }
  | { type: "tasks_loaded"; set: TaskSet }
  | { type: "check_result"; requestId: string; results: TestResult[]; error: LocalRun["error"]; message?: string };

/* ───────────────────────── Разбор игровых сообщений ───────────────────────── */

export function emptyGame(kind: GameKind, settings: GameSettings): GameSnapshot {
  return {
    kind,
    settings,
    phase: "countdown",
    index: -1,
    count: 0,
    deadline: null,
    limitMs: null,
    pausedLeftMs: null,
    task: null,
    myAnswer: null,
    reveal: null,
    result: null,
    leaders: [],
    teamScores: [],
    answered: 0,
    total: 0,
    rope: 0,
    lastPull: null,
    winner: null,
    lockedUntil: null,
    submissions: {},
    localRun: null,
  };
}

/**
 * Применить сообщение сервера к состоянию игры. Чистая функция:
 * её используют и расширение, и витрина. `clock.offset` — «сервер − мои часы»,
 * его обновляет сообщение state. Возвращает undefined, если сообщение не игровое.
 */
export function applyGameMessage(
  game: GameSnapshot | null,
  msg: ServerMessage,
  clock: { offset: number },
): GameSnapshot | null | undefined {
  const local = (ms: number | null) => (ms === null ? null : ms - clock.offset);
  const patch = (p: Partial<GameSnapshot>) => (game ? { ...game, ...p } : game);
  switch (msg.type) {
    case "game_started": {
      const fresh = !game || game.phase === "over";
      return { ...emptyGame(msg.game, msg.settings), ...(fresh ? {} : { leaders: game.leaders, teamScores: game.teamScores }) };
    }
    case "task":
      return patch({
        task: { ...(msg.task as PublicTask), id: msg.taskId } as GameSnapshot["task"],
        index: msg.index,
        deadline: local(msg.deadline),
        limitMs: msg.limitMs,
        myAnswer: null,
        reveal: null,
        // В канате блокировка после ошибки переживает смену задания.
        result: game?.kind === "tug" ? game.result : null,
        // Новое задание — новые отправки; локальный прогон остаётся, если задание то же.
        submissions: game?.task?.id === msg.taskId ? game.submissions : {},
        localRun: game?.localRun?.taskId === msg.taskId ? game.localRun : null,
      });
    case "answered":
      return game?.task?.id === msg.taskId ? patch({ myAnswer: msg.answer }) : game;
    case "reveal":
      return patch({ reveal: { answer: msg.answer, explanation: msg.explanation, stats: msg.stats, solutions: msg.solutions } });
    case "result":
      return patch({ result: { correct: msg.correct, points: msg.points, place: msg.place }, lockedUntil: local(msg.lockedUntil) });
    case "teacher_feed": {
      const e = msg.event;
      if (!game || e.kind !== "submission" || e.taskId !== game.task?.id) return game;
      const prev = game.submissions[e.playerId];
      // Правильное решение не затирается последующими попытками.
      if (prev?.correct && !e.correct) return game;
      return patch({
        submissions: {
          ...game.submissions,
          [e.playerId]: { correct: e.correct, code: e.code, report: e.report, answer: e.answer, at: e.at - clock.offset, attempts: (prev?.attempts ?? 0) + 1 },
        },
      });
    }
    case "state": {
      const st = msg.state;
      clock.offset = st.serverNow - Date.now();
      return patch({
        phase: st.phase,
        index: st.taskIndex,
        count: st.taskCount,
        deadline: local(st.deadline),
        pausedLeftMs: st.pausedLeftMs,
        leaders: st.leaders,
        teamScores: st.teamScores,
        answered: st.answered,
        total: st.total,
        rope: st.rope,
        lastPull: st.lastPull ? { ...st.lastPull, at: st.lastPull.at - clock.offset } : null,
        winner: st.winner,
      });
    }
    case "game_over":
      return patch({ phase: "over", deadline: null, leaders: msg.leaders, teamScores: msg.teamScores });
    case "game_reset":
      return null;
    default:
      return undefined;
  }
}
