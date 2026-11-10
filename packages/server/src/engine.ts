/**
 * Движок игры. Чистые функции над сериализуемым состоянием GameData:
 * никакого Cloudflare, только «состояние + время → новое состояние + сообщения».
 * Durable Object комнаты хранит GameData и рассылает эффекты.
 *
 * Этап 3: викторина. Остальные игры добавятся сюда же.
 */
import {
  quizPoints,
  teamAverage,
  toPublicTask,
  type GameKind,
  type GameSettings,
  type GameState,
  type LeaderRow,
  type ServerMessage,
  type Task,
  type TeamIndex,
  type TeamMode,
} from "@codearena/shared";

export const COUNTDOWN_MS = 3500;

export type IdTask = Task & { id: string };

export interface Answer {
  answer: number | string;
  at: number;
  correct: boolean;
  points: number;
}

export interface GameData {
  game: GameKind;
  settings: GameSettings;
  tasks: IdTask[];
  phase: GameState["phase"];
  /** Индекс текущего задания; −1 во время отсчёта перед первым. */
  index: number;
  deadline: number | null;
  /** Когда показали текущее задание (для очков за скорость). */
  shownAt: number;
  pausedFrom: "countdown" | "playing" | null;
  pausedLeftMs: number | null;
  pausedAt: number | null;
  /** taskId → playerId → ответ */
  answers: Record<string, Record<string, Answer>>;
  scores: Record<string, number>;
}

export interface EnginePlayer {
  id: string;
  name: string;
  team: TeamIndex | null;
}

export interface EngineEnv {
  now: number;
  players: EnginePlayer[];
  /** Кто из учеников сейчас в сети. */
  online: ReadonlySet<string>;
  mode: TeamMode;
}

/** Кому отправить: всем, учителю, всем ученикам или конкретному игроку. */
export type Target = "all" | "teacher" | "students" | { player: string };
export interface Effect {
  to: Target;
  msg: ServerMessage;
}

export class GameError extends Error {
  constructor(
    readonly code: "invalid_tasks" | "unknown_task" | "already_answered" | "no_game" | "locked",
    message: string,
  ) {
    super(message);
  }
}

/* ───────────────────────── Старт ───────────────────────── */

export function startGame(game: GameKind, tasks: Task[], settings: GameSettings, now: number): GameData {
  if (game !== "quiz") throw new GameError("no_game", "Эта игра появится позже");
  if (tasks.length === 0) throw new GameError("invalid_tasks", "Добавьте хотя бы один вопрос");
  if (tasks.some((t) => t.type !== "choice")) {
    throw new GameError("invalid_tasks", "В викторине только вопросы с вариантами ответа");
  }
  return {
    game,
    settings,
    tasks: tasks.map((t, i) => ({ ...t, id: `t${i}` })),
    phase: "countdown",
    index: -1,
    deadline: now + COUNTDOWN_MS,
    shownAt: now,
    pausedFrom: null,
    pausedLeftMs: null,
    pausedAt: null,
    answers: {},
    scores: {},
  };
}

export function startEffects(g: GameData, env: EngineEnv): Effect[] {
  return [{ to: "all", msg: { type: "game_started", game: g.game, settings: g.settings } }, stateEffect(g, env)];
}

/* ───────────────────────── Время ───────────────────────── */

/** Сработал таймер: закончился отсчёт или время на вопрос. */
export function onDeadline(g: GameData, env: EngineEnv): Effect[] {
  if (g.deadline === null || env.now < g.deadline) return [];
  if (g.phase === "countdown") return showTask(g, 0, env);
  if (g.phase === "playing") return reveal(g, env);
  return [];
}

function showTask(g: GameData, index: number, env: EngineEnv): Effect[] {
  const task = g.tasks[index]!;
  const limitMs = (g.game === "quiz" ? g.settings.questionSec : task.timeLimitSec) * 1000;
  g.phase = "playing";
  g.index = index;
  g.shownAt = env.now;
  g.deadline = env.now + limitMs;
  g.answers[task.id] ??= {};
  return [
    {
      to: "all",
      msg: {
        type: "task",
        taskId: task.id,
        index,
        task: toPublicTask(task) as Record<string, unknown>,
        deadline: g.deadline,
        limitMs,
      },
    },
    stateEffect(g, env),
  ];
}

/* ───────────────────────── Ответы ───────────────────────── */

export function submit(g: GameData, env: EngineEnv, playerId: string, taskId: string, answer: unknown): Effect[] {
  const task = g.tasks[g.index];
  if (g.phase !== "playing" || !task) throw new GameError("locked", "Сейчас нельзя отвечать");
  if (task.id !== taskId) throw new GameError("unknown_task", "Это задание уже закончилось");
  const bucket = (g.answers[task.id] ??= {});
  if (bucket[playerId]) throw new GameError("already_answered", "Ответ уже принят");
  if (env.now > (g.deadline ?? 0)) throw new GameError("locked", "Время вышло");

  let correct = false;
  if (task.type === "choice") {
    if (typeof answer !== "number" || answer < 0 || answer >= task.options.length) {
      throw new GameError("unknown_task", "Неверный вариант");
    }
    correct = answer === task.correct;
  }
  const points = quizPoints(env.now - g.shownAt, (g.deadline ?? env.now) - g.shownAt, correct);
  bucket[playerId] = { answer: answer as number, at: env.now, correct, points };

  const out: Effect[] = [
    { to: { player: playerId }, msg: { type: "answered", taskId, answer: answer as number } },
    {
      to: "teacher",
      msg: { type: "teacher_feed", event: { kind: "submission", playerId, taskId, correct, answer, at: env.now } },
    },
  ];
  // Ответили все, кто в сети, — не ждём таймер.
  const waiting = [...env.online].filter((id) => !bucket[id]);
  if (waiting.length === 0) return [...out, ...reveal(g, env)];
  return [...out, stateEffect(g, env)];
}

/* ───────────────────────── Показ ответа ───────────────────────── */

function reveal(g: GameData, env: EngineEnv): Effect[] {
  const task = g.tasks[g.index];
  if (!task) return [];
  g.phase = "reveal";
  g.deadline = null;
  const bucket = g.answers[task.id] ?? {};

  for (const [pid, a] of Object.entries(bucket)) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;

  const out: Effect[] = [];
  if (task.type === "choice") {
    const stats = task.options.map((_, i) => Object.values(bucket).filter((a) => a.answer === i).length);
    out.push({
      to: "all",
      msg: { type: "reveal", taskId: task.id, answer: task.correct, explanation: task.explanation, stats },
    });
  }
  for (const p of env.players) {
    const a = bucket[p.id];
    out.push({
      to: { player: p.id },
      msg: { type: "result", taskId: task.id, correct: a?.correct ?? false, points: a?.points ?? 0, lockedUntil: null, place: null },
    });
  }
  out.push(stateEffect(g, env));
  return out;
}

/* ───────────────────────── Учитель ───────────────────────── */

export function next(g: GameData, env: EngineEnv): Effect[] {
  if (g.phase === "countdown") return showTask(g, 0, env);
  if (g.phase === "playing") return reveal(g, env);
  if (g.phase === "reveal") {
    if (g.index + 1 >= g.tasks.length) return finish(g, env);
    return showTask(g, g.index + 1, env);
  }
  return [];
}

export function pause(g: GameData, env: EngineEnv): Effect[] {
  if ((g.phase !== "playing" && g.phase !== "countdown") || g.deadline === null) return [];
  g.pausedFrom = g.phase;
  g.pausedLeftMs = Math.max(0, g.deadline - env.now);
  g.pausedAt = env.now;
  g.phase = "paused";
  g.deadline = null;
  return [stateEffect(g, env)];
}

export function resume(g: GameData, env: EngineEnv): Effect[] {
  if (g.phase !== "paused" || !g.pausedFrom) return [];
  const left = g.pausedLeftMs ?? 0;
  g.phase = g.pausedFrom;
  g.deadline = env.now + left;
  // Время на паузе не должно отнимать очки за скорость.
  g.shownAt += env.now - (g.pausedAt ?? env.now);
  g.pausedFrom = null;
  g.pausedLeftMs = null;
  g.pausedAt = null;
  const out: Effect[] = [stateEffect(g, env)];
  const task = g.tasks[g.index];
  if (g.phase === "playing" && task) {
    out.unshift({
      to: "all",
      msg: { type: "task", taskId: task.id, index: g.index, task: toPublicTask(task) as Record<string, unknown>, deadline: g.deadline, limitMs: g.settings.questionSec * 1000 },
    });
  }
  return out;
}

export function finish(g: GameData, env: EngineEnv): Effect[] {
  // Если завершили посреди вопроса — засчитываем уже данные ответы.
  if (g.phase === "playing" || (g.phase === "paused" && g.pausedFrom === "playing")) {
    const task = g.tasks[g.index];
    if (task) for (const [pid, a] of Object.entries(g.answers[task.id] ?? {})) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;
  }
  g.phase = "over";
  g.deadline = null;
  g.pausedFrom = null;
  g.pausedLeftMs = null;
  g.pausedAt = null;
  const { leaders, teamScores } = standings(g, env);
  return [{ to: "all", msg: { type: "game_over", leaders, teamScores } }, stateEffect(g, env)];
}

/* ───────────────────────── Состояние ───────────────────────── */

export function standings(g: GameData, env: EngineEnv): { leaders: LeaderRow[]; teamScores: number[] } {
  const correctCount = (pid: string) => Object.values(g.answers).filter((b) => b[pid]?.correct).length;
  const leaders: LeaderRow[] = env.players
    .map((p) => ({ id: p.id, name: p.name, team: p.team, score: g.scores[p.id] ?? 0, progress: correctCount(p.id) }))
    .sort((a, b) => b.score - a.score || b.progress - a.progress || a.name.localeCompare(b.name));
  const n = env.mode === "teams2" ? 2 : env.mode === "teams3" ? 3 : 0;
  const teamScores = Array.from({ length: n }, (_, t) => teamAverage(leaders.filter((l) => l.team === t).map((l) => l.score)));
  return { leaders, teamScores };
}

export function gameState(g: GameData, env: EngineEnv): GameState {
  const task = g.tasks[g.index];
  const bucket = task ? (g.answers[task.id] ?? {}) : {};
  const { leaders, teamScores } = standings(g, env);
  return {
    game: g.game,
    phase: g.phase,
    taskIndex: g.index,
    taskCount: g.tasks.length,
    deadline: g.deadline,
    rope: 0,
    teamScores,
    leaders,
    answered: Object.keys(bucket).length,
    total: env.online.size,
    pausedLeftMs: g.pausedLeftMs,
    serverNow: env.now,
  };
}

function stateEffect(g: GameData, env: EngineEnv): Effect {
  return { to: "all", msg: { type: "state", state: gameState(g, env) } };
}

/**
 * Всё, что нужно (пере)подключившемуся клиенту, чтобы оказаться
 * в том же месте игры: старт, текущее задание, показ ответа, свой результат.
 */
export function resumeFor(g: GameData, env: EngineEnv, playerId: string | null): ServerMessage[] {
  const out: ServerMessage[] = [{ type: "game_started", game: g.game, settings: g.settings }];
  const task = g.tasks[g.index];
  if (g.phase === "over") {
    const { leaders, teamScores } = standings(g, env);
    out.push({ type: "game_over", leaders, teamScores });
  } else if (task && (g.phase === "playing" || g.phase === "reveal" || (g.phase === "paused" && g.pausedFrom === "playing"))) {
    out.push({
      type: "task",
      taskId: task.id,
      index: g.index,
      task: toPublicTask(task) as Record<string, unknown>,
      deadline: g.deadline,
      limitMs: g.settings.questionSec * 1000,
    });
    const mine = playerId ? g.answers[task.id]?.[playerId] : undefined;
    if (mine && g.phase !== "reveal") out.push({ type: "answered", taskId: task.id, answer: mine.answer });
    if (g.phase === "reveal") {
      const bucket = g.answers[task.id] ?? {};
      if (task.type === "choice") {
        const stats = task.options.map((_, i) => Object.values(bucket).filter((a) => a.answer === i).length);
        out.push({ type: "reveal", taskId: task.id, answer: task.correct, explanation: task.explanation, stats });
      }
      if (playerId) {
        const a = bucket[playerId];
        out.push({ type: "result", taskId: task.id, correct: a?.correct ?? false, points: a?.points ?? 0, lockedUntil: null, place: null });
      }
    }
  }
  out.push({ type: "state", state: gameState(g, env) });
  return out;
}
