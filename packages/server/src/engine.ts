/**
 * Движок игры. Чистые функции над сериализуемым состоянием GameData:
 * никакого Cloudflare, только «состояние + время → новое состояние + сообщения».
 * Durable Object комнаты хранит GameData и рассылает эффекты.
 *
 * Игры: викторина (quiz), перетягивание каната (tug).
 */
import {
  LIMITS,
  checkShortAnswer,
  pullRope,
  quizPoints,
  ropeWinner,
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
  /** Индекс текущего задания в списке; −1 во время отсчёта. */
  index: number;
  /**
   * Ключ текущего показа задания. В викторине = id задания, в канате задания
   * идут по кругу, поэтому к id добавляется номер показа: «t3.12».
   */
  taskKey: string;
  /** Сколько заданий уже показано (для ключей каната). */
  shown: number;
  deadline: number | null;
  /** Когда показали текущее задание (для очков за скорость). */
  shownAt: number;
  pausedFrom: "countdown" | "playing" | null;
  pausedLeftMs: number | null;
  pausedAt: number | null;
  /** taskKey → playerId → ответ (в канате хранится только победный ответ). */
  answers: Record<string, Record<string, Answer>>;
  scores: Record<string, number>;
  /** Канат: −5 (победа команды 0) … +5 (команды 1). */
  rope: number;
  /** playerId → до какого момента ввод заблокирован после ошибки. */
  locks: Record<string, number>;
  lastPull: GameState["lastPull"];
  winner: TeamIndex | null;
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
    readonly code: "invalid_tasks" | "unknown_task" | "already_answered" | "no_game" | "locked" | "need_two_teams" | "no_team",
    message: string,
  ) {
    super(message);
  }
}

/* ───────────────────────── Старт ───────────────────────── */

export function startGame(game: GameKind, tasks: Task[], settings: GameSettings, now: number, mode: TeamMode = "solo"): GameData {
  if (tasks.length === 0) throw new GameError("invalid_tasks", "Добавьте хотя бы одно задание");
  if (game === "quiz") {
    if (tasks.some((t) => t.type !== "choice")) throw new GameError("invalid_tasks", "В викторине только вопросы с вариантами ответа");
  } else if (game === "tug") {
    if (mode !== "teams2") throw new GameError("need_two_teams", "Для каната нужно ровно 2 команды");
    if (tasks.some((t) => t.type !== "short_answer")) throw new GameError("invalid_tasks", "В канате только задания с коротким ответом");
  } else {
    throw new GameError("no_game", "Эта игра появится позже");
  }
  return {
    game,
    settings,
    tasks: tasks.map((t, i) => ({ ...t, id: `t${i}` })),
    phase: "countdown",
    index: -1,
    taskKey: "",
    shown: 0,
    deadline: now + COUNTDOWN_MS,
    shownAt: now,
    pausedFrom: null,
    pausedLeftMs: null,
    pausedAt: null,
    answers: {},
    scores: {},
    rope: 0,
    locks: {},
    lastPull: null,
    winner: null,
  };
}

export function startEffects(g: GameData, env: EngineEnv): Effect[] {
  return [{ to: "all", msg: { type: "game_started", game: g.game, settings: g.settings } }, stateEffect(g, env)];
}

/* ───────────────────────── Время ───────────────────────── */

/** Сработал таймер: закончился отсчёт, время на вопрос или раунд каната. */
export function onDeadline(g: GameData, env: EngineEnv): Effect[] {
  if (g.deadline === null || env.now < g.deadline) return [];
  if (g.phase === "countdown") return begin(g, env);
  if (g.phase === "playing") return g.game === "tug" ? finish(g, env) : reveal(g, env);
  return [];
}

/** Конец отсчёта: первое задание (в канате заодно стартует общий таймер раунда). */
function begin(g: GameData, env: EngineEnv): Effect[] {
  if (g.game === "tug") g.deadline = env.now + g.settings.roundSec * 1000;
  return showTask(g, 0, env);
}

function limitMs(g: GameData): number {
  return (g.game === "tug" ? g.settings.roundSec : g.settings.questionSec) * 1000;
}

function taskMessage(g: GameData): ServerMessage {
  const task = g.tasks[g.index]!;
  return {
    type: "task",
    taskId: g.taskKey,
    index: g.index,
    task: toPublicTask(task) as Record<string, unknown>,
    deadline: g.deadline,
    limitMs: limitMs(g),
  };
}

function showTask(g: GameData, index: number, env: EngineEnv): Effect[] {
  const task = g.tasks[index]!;
  g.phase = "playing";
  g.index = index;
  g.taskKey = g.game === "tug" ? `${task.id}.${g.shown}` : task.id;
  g.shown += 1;
  g.shownAt = env.now;
  // В викторине у каждого вопроса свой таймер, в канате — один на весь раунд.
  if (g.game === "quiz") g.deadline = env.now + limitMs(g);
  g.answers[g.taskKey] ??= {};
  return [{ to: "all", msg: taskMessage(g) }, stateEffect(g, env)];
}

/* ───────────────────────── Ответы ───────────────────────── */

export function submit(g: GameData, env: EngineEnv, playerId: string, taskId: string, answer: unknown): Effect[] {
  const task = g.tasks[g.index];
  if (g.phase !== "playing" || !task) throw new GameError("locked", "Сейчас нельзя отвечать");
  if (g.taskKey !== taskId) throw new GameError("unknown_task", "Это задание уже закончилось");
  if (env.now > (g.deadline ?? 0)) throw new GameError("locked", "Время вышло");
  return g.game === "tug" ? submitTug(g, env, playerId, task, answer) : submitQuiz(g, env, playerId, task, answer);
}

function submitQuiz(g: GameData, env: EngineEnv, playerId: string, task: IdTask, answer: unknown): Effect[] {
  const bucket = (g.answers[g.taskKey] ??= {});
  if (bucket[playerId]) throw new GameError("already_answered", "Ответ уже принят");
  if (task.type !== "choice" || typeof answer !== "number" || answer < 0 || answer >= task.options.length) {
    throw new GameError("unknown_task", "Неверный вариант");
  }
  const correct = answer === task.correct;
  const points = quizPoints(env.now - g.shownAt, (g.deadline ?? env.now) - g.shownAt, correct);
  bucket[playerId] = { answer, at: env.now, correct, points };

  const out: Effect[] = [
    { to: { player: playerId }, msg: { type: "answered", taskId: g.taskKey, answer } },
    feed(playerId, g.taskKey, correct, answer, env.now),
  ];
  // Ответили все, кто в сети, — не ждём таймер.
  const waiting = [...env.online].filter((id) => !bucket[id]);
  if (waiting.length === 0) return [...out, ...reveal(g, env)];
  return [...out, stateEffect(g, env)];
}

/**
 * Канат: первый правильный ответ тянет канат к своей команде, и сразу всем
 * приходит следующее задание. Ошибка блокирует ввод игроку на wrongLockSec.
 * Durable Object обрабатывает сообщения строго по очереди — двух «первых» не бывает.
 */
function submitTug(g: GameData, env: EngineEnv, playerId: string, task: IdTask, answer: unknown): Effect[] {
  const player = env.players.find((p) => p.id === playerId);
  if (!player || (player.team !== 0 && player.team !== 1)) throw new GameError("no_team", "Учитель ещё не добавил тебя в команду");
  const lockedUntil = g.locks[playerId] ?? 0;
  if (env.now < lockedUntil) throw new GameError("locked", "Подожди пару секунд");
  if (task.type !== "short_answer" || typeof answer !== "string" || !answer.trim()) {
    throw new GameError("unknown_task", "Напиши ответ");
  }

  const correct = checkShortAnswer(answer, task.answers, task.caseSensitive);
  const out: Effect[] = [feed(playerId, g.taskKey, correct, answer, env.now)];

  if (!correct) {
    const until = env.now + g.settings.wrongLockSec * 1000;
    if (g.settings.wrongLockSec > 0) g.locks[playerId] = until;
    out.push({
      to: { player: playerId },
      msg: { type: "result", taskId: g.taskKey, correct: false, points: 0, lockedUntil: g.settings.wrongLockSec > 0 ? until : null, place: null },
    });
    return out;
  }

  g.answers[g.taskKey]![playerId] = { answer, at: env.now, correct: true, points: 1 };
  g.scores[playerId] = (g.scores[playerId] ?? 0) + 1;
  g.rope = pullRope(g.rope, player.team, LIMITS.ropeLimit);
  g.lastPull = { team: player.team, playerId, name: player.name, at: env.now };
  out.push({ to: { player: playerId }, msg: { type: "result", taskId: g.taskKey, correct: true, points: 1, lockedUntil: null, place: null } });

  if (ropeWinner(g.rope, LIMITS.ropeLimit) !== null) return [...out, ...finish(g, env)];
  return [...out, ...showTask(g, (g.index + 1) % g.tasks.length, env)];
}

function feed(playerId: string, taskId: string, correct: boolean, answer: unknown, at: number): Effect {
  return { to: "teacher", msg: { type: "teacher_feed", event: { kind: "submission", playerId, taskId, correct, answer, at } } };
}

/* ───────────────────────── Показ ответа (викторина) ───────────────────────── */

function revealMessages(g: GameData, task: IdTask): ServerMessage[] {
  const bucket = g.answers[g.taskKey] ?? {};
  if (task.type !== "choice") return [];
  const stats = task.options.map((_, i) => Object.values(bucket).filter((a) => a.answer === i).length);
  return [{ type: "reveal", taskId: g.taskKey, answer: task.correct, explanation: task.explanation, stats }];
}

function reveal(g: GameData, env: EngineEnv): Effect[] {
  const task = g.tasks[g.index];
  if (!task) return [];
  g.phase = "reveal";
  g.deadline = null;
  const bucket = g.answers[g.taskKey] ?? {};
  for (const [pid, a] of Object.entries(bucket)) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;

  const out: Effect[] = revealMessages(g, task).map((msg) => ({ to: "all" as const, msg }));
  for (const p of env.players) {
    const a = bucket[p.id];
    out.push({
      to: { player: p.id },
      msg: { type: "result", taskId: g.taskKey, correct: a?.correct ?? false, points: a?.points ?? 0, lockedUntil: null, place: null },
    });
  }
  out.push(stateEffect(g, env));
  return out;
}

/* ───────────────────────── Учитель ───────────────────────── */

/** «Дальше»: в викторине — показать ответ / следующий вопрос, в канате — пропустить задание. */
export function next(g: GameData, env: EngineEnv): Effect[] {
  if (g.phase === "countdown") return begin(g, env);
  if (g.game === "tug") {
    if (g.phase === "playing") return showTask(g, (g.index + 1) % g.tasks.length, env);
    return [];
  }
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
  const pausedFor = env.now - (g.pausedAt ?? env.now);
  g.phase = g.pausedFrom;
  g.deadline = env.now + left;
  // Время на паузе не должно отнимать очки за скорость и сокращать блокировки.
  g.shownAt += pausedFor;
  for (const id of Object.keys(g.locks)) g.locks[id]! += pausedFor;
  g.pausedFrom = null;
  g.pausedLeftMs = null;
  g.pausedAt = null;
  const out: Effect[] = [stateEffect(g, env)];
  if (g.phase === "playing" && g.tasks[g.index]) out.unshift({ to: "all", msg: taskMessage(g) });
  return out;
}

export function finish(g: GameData, env: EngineEnv): Effect[] {
  // Викторину завершили посреди вопроса — засчитываем уже данные ответы.
  if (g.game === "quiz" && (g.phase === "playing" || (g.phase === "paused" && g.pausedFrom === "playing"))) {
    for (const [pid, a] of Object.entries(g.answers[g.taskKey] ?? {})) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;
  }
  if (g.game === "tug") g.winner = ropeWinner(g.rope, LIMITS.ropeLimit, true);
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
  // Викторина: среднее по команде (большая команда не выигрывает числом).
  // Канат: сколько рывков сделала команда.
  const teamScores = Array.from({ length: n }, (_, t) => {
    const scores = leaders.filter((l) => l.team === t).map((l) => l.score);
    return g.game === "tug" ? scores.reduce((a, b) => a + b, 0) : teamAverage(scores);
  });
  return { leaders, teamScores };
}

export function gameState(g: GameData, env: EngineEnv): GameState {
  const bucket = g.answers[g.taskKey] ?? {};
  const { leaders, teamScores } = standings(g, env);
  return {
    game: g.game,
    phase: g.phase,
    taskIndex: g.index,
    taskCount: g.tasks.length,
    deadline: g.deadline,
    rope: g.rope,
    teamScores,
    leaders,
    answered: Object.keys(bucket).length,
    total: env.online.size,
    pausedLeftMs: g.pausedLeftMs,
    serverNow: env.now,
    lastPull: g.lastPull,
    winner: g.winner,
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
    out.push(taskMessage(g));
    const bucket = g.answers[g.taskKey] ?? {};
    const mine = playerId ? bucket[playerId] : undefined;
    if (g.game === "quiz" && mine && g.phase !== "reveal") out.push({ type: "answered", taskId: g.taskKey, answer: mine.answer });
    // Канат: если игрок ещё заблокирован после ошибки — вернуть блокировку.
    const lock = playerId ? g.locks[playerId] : undefined;
    if (g.game === "tug" && lock && lock > env.now) {
      out.push({ type: "result", taskId: g.taskKey, correct: false, points: 0, lockedUntil: lock, place: null });
    }
    if (g.phase === "reveal") {
      out.push(...revealMessages(g, task));
      if (playerId) {
        out.push({ type: "result", taskId: g.taskKey, correct: mine?.correct ?? false, points: mine?.points ?? 0, lockedUntil: null, place: null });
      }
    }
  }
  out.push({ type: "state", state: gameState(g, env) });
  return out;
}
