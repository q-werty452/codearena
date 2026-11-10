/**
 * Протокол между расширением (host) и его webview.
 * Соединение с сервером держит расширение, а webview получает готовый
 * снимок сессии и только рисует его. Так боковая панель и панель игры
 * всегда показывают одно и то же.
 */
import type {
  ClientMessage,
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
import type { PublicTask, TaskSet } from "./tasks.ts";

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
  reveal: { answer: unknown; explanation?: string; stats?: number[] } | null;
  result: { correct: boolean; points: number } | null;
  leaders: LeaderRow[];
  teamScores: number[];
  answered: number;
  total: number;
}

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
  /** Набор заданий учителя: сохранить в файл / загрузить из файла. */
  | { type: "save_tasks"; set: TaskSet }
  | { type: "load_tasks" };

/** расширение → webview */
export type HostToUi =
  | { type: "session"; session: SessionSnapshot }
  | { type: "prefill"; code: string }
  | { type: "server"; msg: ServerMessage }
  | { type: "toast"; text: string }
  | { type: "tasks_loaded"; set: TaskSet };

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
        result: null,
      });
    case "answered":
      return game?.task?.id === msg.taskId ? patch({ myAnswer: msg.answer }) : game;
    case "reveal":
      return patch({ reveal: { answer: msg.answer, explanation: msg.explanation, stats: msg.stats } });
    case "result":
      return patch({ result: { correct: msg.correct, points: msg.points } });
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
