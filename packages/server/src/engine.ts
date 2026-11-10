/**
 * Движок игры. Чистые функции над сериализуемым состоянием GameData:
 * никакого Cloudflare, только «состояние + время → новое состояние + сообщения».
 * Durable Object комнаты хранит GameData и рассылает эффекты.
 *
 * Игры: викторина (quiz), «Найди баг» (bug), перетягивание каната (tug), Codewars (codewars), гонка (race).
 */
import {
  LIMITS,
  RULE_LANGUAGES,
  RUNNABLE_LANGUAGES,
  checkShortAnswer,
  codewarsPoints,
  pullRope,
  rankSolutions,
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
  type TestReport,
  type FlagKind,
  type PlayerFlags,
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
  /** Гонка: у каждого своя очередь задач. pos — сколько решено, finishedAt — когда дошёл до финиша. */
  race?: RaceData;
  /** Флаги анти-чита по игрокам — только для учителя. */
  flags?: Record<string, PlayerFlags>;
}

export interface RaceData {
  length: number;
  pos: Record<string, number>;
  finishedAt: Record<string, number>;
  teamFinishedAt: Record<string, number>;
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
  } else if (game === "bug") {
    for (const t of tasks) {
      if (t.type !== "find_line" && t.type !== "fix_bug" && t.type !== "best_variant") {
        throw new GameError("invalid_tasks", "В «Найди баг» только задания: найди строку, исправь баг, выбери лучший");
      }
      if (t.type === "fix_bug" && !hasChecks(t)) throw new GameError("invalid_tasks", "«Исправь баг» нужен язык с проверкой и тесты или правила");
    }
  } else if (game === "codewars") {
    if (tasks.some((t) => t.type !== "code" || !hasChecks(t))) {
      throw new GameError("invalid_tasks", "В Codewars нужны задачи с тестами (JS/Python) или правилами (HTML/CSS)");
    }
  } else if (game === "race") {
    for (const t of tasks) {
      if (t.type !== "short_answer" && t.type !== "choice" && t.type !== "code") {
        throw new GameError("invalid_tasks", "В гонке задания: короткий ответ, вариант ответа или код");
      }
      if (t.type === "code" && !hasChecks(t)) throw new GameError("invalid_tasks", "У задачи с кодом нужны тесты или правила");
    }
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
    race: game === "race" ? { length: settings.raceLength, pos: {}, finishedAt: {}, teamFinishedAt: {} } : undefined,
  };
}

/** Код можно проверить у ученика: язык с раннером и есть тесты/правила. */
function hasChecks(t: Task): boolean {
  if (t.type !== "code" && t.type !== "fix_bug") return false;
  if (!RUNNABLE_LANGUAGES.has(t.language)) return false;
  return RULE_LANGUAGES.has(t.language) ? t.rules.length > 0 : t.tests.length > 0;
}

export function startEffects(g: GameData, env: EngineEnv): Effect[] {
  return [{ to: "all", msg: { type: "game_started", game: g.game, settings: g.settings } }, stateEffect(g, env)];
}

/* ───────────────────────── Время ───────────────────────── */

/** Сработал таймер: закончился отсчёт, время на вопрос или раунд каната. */
export function onDeadline(g: GameData, env: EngineEnv): Effect[] {
  if (g.deadline === null || env.now < g.deadline) return [];
  if (g.phase === "countdown") return begin(g, env);
  if (g.phase === "playing") return g.game === "tug" || g.game === "race" ? finish(g, env) : reveal(g, env);
  return [];
}

/** Конец отсчёта: первое задание (в канате заодно стартует общий таймер раунда). */
function begin(g: GameData, env: EngineEnv): Effect[] {
  if (g.game === "race") return raceBegin(g, env);
  if (g.game === "tug") g.deadline = env.now + g.settings.roundSec * 1000;
  return showTask(g, 0, env);
}

function limitMs(g: GameData): number {
  const task = g.tasks[g.index];
  if (g.game === "tug" || g.game === "race") return g.settings.roundSec * 1000;
  if (g.game === "codewars" || task?.type === "fix_bug") return (task?.timeLimitSec ?? 300) * 1000;
  return g.settings.questionSec * 1000;
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
  // В викторине и Codewars у каждого задания свой таймер, в канате — один на весь раунд.
  if (g.game !== "tug") g.deadline = env.now + limitMs(g);
  g.answers[g.taskKey] ??= {};
  return [{ to: "all", msg: taskMessage(g) }, stateEffect(g, env)];
}

/* ───────────────────────── Ответы ───────────────────────── */

export function submit(
  g: GameData,
  env: EngineEnv,
  playerId: string,
  taskId: string,
  answer: unknown,
  extra: { code?: string; report?: TestReport } = {},
): Effect[] {
  if (g.game === "race") {
    if (g.phase !== "playing") throw new GameError("locked", "Сейчас нельзя отвечать");
    if (env.now > (g.deadline ?? 0)) throw new GameError("locked", "Время вышло");
    return submitRace(g, env, playerId, taskId, answer, extra);
  }
  const task = g.tasks[g.index];
  if (g.phase !== "playing" || !task) throw new GameError("locked", "Сейчас нельзя отвечать");
  if (g.taskKey !== taskId) throw new GameError("unknown_task", "Это задание уже закончилось");
  if (env.now > (g.deadline ?? 0)) throw new GameError("locked", "Время вышло");
  if (g.game === "tug") return submitTug(g, env, playerId, task, answer);
  if (g.game === "codewars") return submitCode(g, env, playerId, extra.code, extra.report);
  if (task.type === "fix_bug") return submitFix(g, env, playerId, extra.code, extra.report);
  return submitQuiz(g, env, playerId, task, answer);
}

/** Место среди правильных решений текущего задания: короче выше, при равной длине — раньше. */
function solutionsRanked(g: GameData, env: EngineEnv) {
  const bucket = g.answers[g.taskKey] ?? {};
  const names = new Map(env.players.map((p) => [p.id, p.name]));
  return rankSolutions(
    Object.entries(bucket)
      .filter(([, a]) => a.correct)
      .map(([playerId, a]) => ({ playerId, code: String(a.answer), at: a.at })),
  ).map((s) => ({ ...s, name: names.get(s.playerId) ?? "?" }));
}

/**
 * «Исправь баг»: как Codewars, но очки — за скорость (500–1000), а не за длину.
 * Пробовать можно до правильного ответа; неправильные попытки видит только учитель.
 */
function submitFix(g: GameData, env: EngineEnv, playerId: string, code: string | undefined, report: TestReport | undefined): Effect[] {
  const bucket = (g.answers[g.taskKey] ??= {});
  if (bucket[playerId]?.correct) throw new GameError("already_answered", "Баг уже исправлен");
  if (typeof code !== "string" || !code.trim() || !report) throw new GameError("unknown_task", "Нет кода или результатов проверки");
  const correct = report.total > 0 && report.passed === report.total;
  const out: Effect[] = [
    { to: "teacher", msg: { type: "teacher_feed", event: { kind: "submission", playerId, taskId: g.taskKey, correct, code, report, at: env.now } } },
  ];
  if (!correct) {
    out.push({ to: { player: playerId }, msg: { type: "result", taskId: g.taskKey, correct: false, points: 0, lockedUntil: null, place: null } });
    return out;
  }
  const points = quizPoints(env.now - g.shownAt, (g.deadline ?? env.now) - g.shownAt, true);
  bucket[playerId] = { answer: code, at: env.now, correct: true, points };
  out.push({ to: { player: playerId }, msg: { type: "result", taskId: g.taskKey, correct: true, points, lockedUntil: null, place: null } });
  if ([...env.online].every((id) => bucket[id]?.correct)) return [...out, ...reveal(g, env)];
  return [...out, stateEffect(g, env)];
}

/**
 * Codewars: тесты прогоняет расширение ученика, сюда приходят код и отчёт.
 * Неправильные решения видит только учитель; правильное фиксируется, и место
 * считается по длине кода без пробелов.
 */
function submitCode(g: GameData, env: EngineEnv, playerId: string, code: string | undefined, report: TestReport | undefined): Effect[] {
  const bucket = (g.answers[g.taskKey] ??= {});
  if (bucket[playerId]?.correct) throw new GameError("already_answered", "Задача уже решена");
  if (typeof code !== "string" || !code.trim() || !report) throw new GameError("unknown_task", "Нет кода или результатов тестов");
  const correct = report.total > 0 && report.passed === report.total;
  const out: Effect[] = [
    { to: "teacher", msg: { type: "teacher_feed", event: { kind: "submission", playerId, taskId: g.taskKey, correct, code, report, at: env.now } } },
  ];
  if (!correct) {
    out.push({ to: { player: playerId }, msg: { type: "result", taskId: g.taskKey, correct: false, points: 0, lockedUntil: null, place: null } });
    return out;
  }
  bucket[playerId] = { answer: code, at: env.now, correct: true, points: 0 };
  const place = solutionsRanked(g, env).findIndex((s) => s.playerId === playerId) + 1;
  out.push({ to: { player: playerId }, msg: { type: "result", taskId: g.taskKey, correct: true, points: 0, lockedUntil: null, place } });
  // Решили все, кто в сети, — показываем решения, не дожидаясь таймера.
  if ([...env.online].every((id) => bucket[id]?.correct)) return [...out, ...reveal(g, env)];
  return [...out, stateEffect(g, env)];
}

/** Вопрос с одним ответом: вариант викторины, строка с багом, лучший вариант кода. */
function submitQuiz(g: GameData, env: EngineEnv, playerId: string, task: IdTask, answer: unknown): Effect[] {
  const bucket = (g.answers[g.taskKey] ??= {});
  if (bucket[playerId]) throw new GameError("already_answered", "Ответ уже принят");
  const max =
    task.type === "choice" ? task.options.length
    : task.type === "best_variant" ? task.variants.length
    : task.type === "find_line" ? task.code.split("\n").length + 1
    : 0;
  const min = task.type === "find_line" ? 1 : 0;
  if (typeof answer !== "number" || !Number.isInteger(answer) || answer < min || answer >= max) {
    throw new GameError("unknown_task", "Неверный вариант");
  }
  const right = task.type === "find_line" ? task.line : task.type === "choice" || task.type === "best_variant" ? task.correct : -1;
  const correct = answer === right;
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

/* ───────────────────────── Гонка ───────────────────────── */

const raceKey = (pos: number) => `r${pos}`;

/** Задание игрока: своя очередь, задания идут по кругу, если их меньше длины трассы. */
function raceTaskMsg(g: GameData, playerId: string): ServerMessage {
  const pos = g.race!.pos[playerId] ?? 0;
  const task = g.tasks[pos % g.tasks.length]!;
  return { type: "task", taskId: raceKey(pos), index: pos, task: toPublicTask(task) as Record<string, unknown>, deadline: g.deadline, limitMs: limitMs(g) };
}

function raceBegin(g: GameData, env: EngineEnv): Effect[] {
  g.phase = "playing";
  g.index = 0;
  g.shownAt = env.now;
  g.deadline = env.now + g.settings.roundSec * 1000;
  const out: Effect[] = env.players.map((p) => ({ to: { player: p.id }, msg: raceTaskMsg(g, p.id) }));
  return [...out, stateEffect(g, env)];
}

/** Позиция команды — среднее по участникам: каждый правильный ответ двигает её на 1/N шага. */
function teamPositions(g: GameData, env: EngineEnv): number[] {
  const n = env.mode === "teams2" ? 2 : env.mode === "teams3" ? 3 : 0;
  return Array.from({ length: n }, (_, t) => {
    const members = env.players.filter((p) => p.team === t);
    if (!members.length) return 0;
    const sum = members.reduce((a, p) => a + (g.race!.pos[p.id] ?? 0), 0);
    return Math.round((sum / members.length) * 10) / 10;
  });
}

function submitRace(
  g: GameData,
  env: EngineEnv,
  playerId: string,
  taskId: string,
  answer: unknown,
  extra: { code?: string; report?: TestReport },
): Effect[] {
  const race = g.race!;
  const pos = race.pos[playerId] ?? 0;
  if (race.finishedAt[playerId] !== undefined) throw new GameError("already_answered", "Ты уже на финише");
  if (taskId !== raceKey(pos)) throw new GameError("unknown_task", "Это задание уже решено");
  const lockedUntil = g.locks[playerId] ?? 0;
  if (env.now < lockedUntil) throw new GameError("locked", "Подожди пару секунд");
  const task = g.tasks[pos % g.tasks.length]!;

  let correct = false;
  if (task.type === "choice") {
    if (typeof answer !== "number" || answer < 0 || answer >= task.options.length) throw new GameError("unknown_task", "Неверный вариант");
    correct = answer === task.correct;
  } else if (task.type === "short_answer") {
    if (typeof answer !== "string" || !answer.trim()) throw new GameError("unknown_task", "Напиши ответ");
    correct = checkShortAnswer(answer, task.answers, task.caseSensitive);
  } else if (task.type === "code") {
    if (typeof extra.code !== "string" || !extra.report) throw new GameError("unknown_task", "Нет кода или результатов проверки");
    correct = extra.report.total > 0 && extra.report.passed === extra.report.total;
  }

  const out: Effect[] = [
    { to: "teacher", msg: { type: "teacher_feed", event: { kind: "submission", playerId, taskId, correct, answer, code: extra.code, report: extra.report, at: env.now } } },
  ];

  if (!correct) {
    // Ошибка ничего не даёт; на вопросах с ответом — короткий блок, чтобы не перебирали варианты.
    const lock = task.type !== "code" && g.settings.wrongLockSec > 0 ? env.now + g.settings.wrongLockSec * 1000 : null;
    if (lock) g.locks[playerId] = lock;
    out.push({ to: { player: playerId }, msg: { type: "result", taskId, correct: false, points: 0, lockedUntil: lock, place: null } });
    return out;
  }

  race.pos[playerId] = pos + 1;
  g.scores[playerId] = pos + 1;
  let place: number | null = null;
  if (pos + 1 >= race.length) {
    race.finishedAt[playerId] = env.now;
    place = Object.keys(race.finishedAt).length;
  }
  // Командный финиш: средняя позиция команды дошла до конца трассы.
  teamPositions(g, env).forEach((v, t) => {
    if (v >= race.length && race.teamFinishedAt[t] === undefined) race.teamFinishedAt[t] = env.now;
  });

  out.push({ to: { player: playerId }, msg: { type: "result", taskId, correct: true, points: 1, lockedUntil: null, place } });
  if (place === null) out.push({ to: { player: playerId }, msg: raceTaskMsg(g, playerId) });

  if (raceOver(g, env)) return [...out, ...finish(g, env)];
  return [...out, stateEffect(g, env)];
}

/** Конец гонки: финишировали все, кто в сети (или все команды). */
function raceOver(g: GameData, env: EngineEnv): boolean {
  const race = g.race!;
  const n = env.mode === "teams2" ? 2 : env.mode === "teams3" ? 3 : 0;
  if (n > 0) {
    const teamsWithPlayers = Array.from({ length: n }, (_, t) => t).filter((t) => env.players.some((p) => p.team === t));
    if (teamsWithPlayers.length > 0) return teamsWithPlayers.every((t) => race.teamFinishedAt[t] !== undefined);
  }
  const online = [...env.online];
  return online.length > 0 && online.every((id) => race.finishedAt[id] !== undefined);
}

/* ───────────────────────── Показ ответа (викторина) ───────────────────────── */

function revealMessages(g: GameData, task: IdTask, env: EngineEnv): ServerMessage[] {
  const bucket = g.answers[g.taskKey] ?? {};
  if (g.game === "codewars") {
    const solutions = solutionsRanked(g, env).map(({ playerId, name, code, length }) => ({ playerId, name, code, length }));
    return [{ type: "reveal", taskId: g.taskKey, answer: null, explanation: task.explanation, solutions }];
  }
  const count = (v: number) => Object.values(bucket).filter((a) => a.answer === v).length;
  switch (task.type) {
    case "choice":
      return [{ type: "reveal", taskId: g.taskKey, answer: task.correct, explanation: task.explanation, stats: task.options.map((_, i) => count(i)) }];
    case "best_variant":
      return [{ type: "reveal", taskId: g.taskKey, answer: task.correct, explanation: task.explanation, stats: task.variants.map((_, i) => count(i)) }];
    case "find_line": {
      // stats[i] — сколько человек выбрали строку i + 1.
      const lines = task.code.split("\n").length;
      return [{ type: "reveal", taskId: g.taskKey, answer: task.line, explanation: task.explanation, stats: Array.from({ length: lines }, (_, i) => count(i + 1)) }];
    }
    case "fix_bug":
      return [{ type: "reveal", taskId: g.taskKey, answer: null, explanation: task.explanation, stats: [Object.values(bucket).filter((a) => a.correct).length] }];
    default:
      return [];
  }
}

function reveal(g: GameData, env: EngineEnv): Effect[] {
  const task = g.tasks[g.index];
  if (!task) return [];
  g.phase = "reveal";
  g.deadline = null;
  const bucket = g.answers[g.taskKey] ?? {};
  // Codewars: очки за место в списке правильных решений.
  const ranked = g.game === "codewars" ? solutionsRanked(g, env) : [];
  ranked.forEach((s, i) => (bucket[s.playerId]!.points = codewarsPoints(i + 1)));
  for (const [pid, a] of Object.entries(bucket)) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;

  const out: Effect[] = revealMessages(g, task, env).map((msg) => ({ to: "all" as const, msg }));
  for (const p of env.players) {
    const a = bucket[p.id];
    const place = ranked.findIndex((s) => s.playerId === p.id) + 1 || null;
    out.push({
      to: { player: p.id },
      msg: { type: "result", taskId: g.taskKey, correct: a?.correct ?? false, points: a?.points ?? 0, lockedUntil: null, place },
    });
  }
  out.push(stateEffect(g, env));
  return out;
}

/* ───────────────────────── Учитель ───────────────────────── */

/** «Дальше»: в викторине — показать ответ / следующий вопрос, в канате — пропустить задание. */
export function next(g: GameData, env: EngineEnv): Effect[] {
  if (g.phase === "countdown") return begin(g, env);
  if (g.game === "race") return [];
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
  if (g.phase === "playing" && g.game === "race") {
    for (const p of env.players) if (g.race!.finishedAt[p.id] === undefined) out.unshift({ to: { player: p.id }, msg: raceTaskMsg(g, p.id) });
  } else if (g.phase === "playing" && g.tasks[g.index]) out.unshift({ to: "all", msg: taskMessage(g) });
  return out;
}

export function finish(g: GameData, env: EngineEnv): Effect[] {
  // Викторину завершили посреди вопроса — засчитываем уже данные ответы.
  if (g.game !== "tug" && (g.phase === "playing" || (g.phase === "paused" && g.pausedFrom === "playing"))) {
    const bucket = g.answers[g.taskKey] ?? {};
    if (g.game === "codewars") solutionsRanked(g, env).forEach((s, i) => (bucket[s.playerId]!.points = codewarsPoints(i + 1)));
    for (const [pid, a] of Object.entries(bucket)) g.scores[pid] = (g.scores[pid] ?? 0) + a.points;
  }
  if (g.game === "tug") g.winner = ropeWinner(g.rope, LIMITS.ropeLimit, true);
  if (g.game === "race" && env.mode !== "solo") {
    // Команда, первой дошедшая до финиша; иначе — с наибольшей средней позицией (ничья — null).
    const fin = Object.entries(g.race!.teamFinishedAt).sort((a, b) => a[1] - b[1]);
    if (fin.length) g.winner = Number(fin[0]![0]) as TeamIndex;
    else {
      const tp = teamPositions(g, env);
      const best = Math.max(...tp);
      g.winner = tp.filter((v) => v === best).length === 1 && best > 0 ? (tp.indexOf(best) as TeamIndex) : null;
    }
  }
  g.phase = "over";
  g.deadline = null;
  g.pausedFrom = null;
  g.pausedLeftMs = null;
  g.pausedAt = null;
  const { leaders, teamScores } = standings(g, env);
  return [{ to: "all", msg: { type: "game_over", leaders, teamScores } }, stateEffect(g, env)];
}

/* ───────────────────────── Анти-чит ───────────────────────── */

/**
 * Флаг от расширения ученика. Сервер не наказывает автоматически —
 * только копит сводку для учителя. Флаг выключенной защиты игнорируется.
 */
export function flag(g: GameData, playerId: string, kind: FlagKind, detail: string): Effect[] {
  if (g.phase === "over") return [];
  const ac = g.settings.antiCheat;
  const enabled = { paste: ac.pasteBlock, big_insert: ac.bigInsertDetect, focus_lost: ac.focusTracking, ai_extension: ac.aiExtensions }[kind];
  if (!enabled) return [];
  const flags = (g.flags ??= {});
  const mine = (flags[playerId] ??= {});
  const prev = mine[kind] ?? { count: 0, value: 0, detail: "" };
  const n = Math.max(0, Number.parseFloat(detail) || 0);
  mine[kind] =
    kind === "focus_lost"
      ? { count: prev.count + 1, value: Math.round(prev.value + n), detail } // value — всего секунд
      : kind === "ai_extension"
        ? { count: 1, value: 0, detail: detail.slice(0, 200) } // список расширений, один раз
        : { count: prev.count + 1, value: Math.max(prev.value, n), detail }; // value — самая большая вставка
  return [{ to: "teacher", msg: { type: "flags", flags } }];
}

/* ───────────────────────── Состояние ───────────────────────── */

export function standings(g: GameData, env: EngineEnv): { leaders: LeaderRow[]; teamScores: number[] } {
  if (g.game === "race") {
    // Места: сначала финишировавшие по времени финиша, потом по позиции на трассе.
    const r = g.race!;
    const fin = (id: string) => r.finishedAt[id] ?? Infinity;
    const leaders: LeaderRow[] = env.players
      .map((p) => ({ id: p.id, name: p.name, team: p.team, score: r.pos[p.id] ?? 0, progress: r.pos[p.id] ?? 0 }))
      .sort((a, b) => fin(a.id) - fin(b.id) || b.progress - a.progress || a.name.localeCompare(b.name));
    return { leaders, teamScores: teamPositions(g, env) };
  }
  const correctCount = (pid: string) => Object.values(g.answers).filter((b) => b[pid]?.correct).length;
  const leaders: LeaderRow[] = env.players
    .map((p) => ({ id: p.id, name: p.name, team: p.team, score: g.scores[p.id] ?? 0, progress: correctCount(p.id) }))
    .sort((a, b) => b.score - a.score || b.progress - a.progress || a.name.localeCompare(b.name));
  const n = env.mode === "teams2" ? 2 : env.mode === "teams3" ? 3 : 0;
  // Викторина: среднее по команде (большая команда не выигрывает числом).
  // Канат: сколько рывков сделала команда.
  const teamScores = Array.from({ length: n }, (_, t) => {
    const scores = leaders.filter((l) => l.team === t).map((l) => l.score);
    if (g.game === "tug") return scores.reduce((a, b) => a + b, 0);
    // Codewars: сколько участников команды решили (по всем задачам).
    if (g.game === "codewars") return leaders.filter((l) => l.team === t).reduce((a, l) => a + l.progress, 0);
    return teamAverage(scores);
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
    taskCount: g.race ? g.race.length : g.tasks.length,
    deadline: g.deadline,
    rope: g.rope,
    teamScores,
    leaders,
    answered: g.race ? Object.keys(g.race.finishedAt).length : Object.keys(bucket).length,
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
  } else if (g.game === "race" && playerId && (g.phase === "playing" || (g.phase === "paused" && g.pausedFrom === "playing"))) {
    const r = g.race!;
    if (r.finishedAt[playerId] !== undefined) {
      const place = Object.entries(r.finishedAt).sort((a, b) => a[1] - b[1]).findIndex(([id]) => id === playerId) + 1;
      out.push({ type: "result", taskId: raceKey(r.pos[playerId] ?? 0), correct: true, points: 1, lockedUntil: null, place });
    } else {
      out.push(raceTaskMsg(g, playerId));
      const lock = g.locks[playerId];
      if (lock && lock > env.now) out.push({ type: "result", taskId: raceKey(r.pos[playerId] ?? 0), correct: false, points: 0, lockedUntil: lock, place: null });
    }
  } else if (g.game !== "race" && task && (g.phase === "playing" || g.phase === "reveal" || (g.phase === "paused" && g.pausedFrom === "playing"))) {
    out.push(taskMessage(g));
    const bucket = g.answers[g.taskKey] ?? {};
    const mine = playerId ? bucket[playerId] : undefined;
    const single = task.type === "choice" || task.type === "find_line" || task.type === "best_variant";
    if (single && mine && g.phase !== "reveal") out.push({ type: "answered", taskId: g.taskKey, answer: mine.answer });
    if (task.type === "fix_bug" && mine?.correct && g.phase !== "reveal") {
      out.push({ type: "result", taskId: g.taskKey, correct: true, points: mine.points, lockedUntil: null, place: null });
    }
    if (g.game === "codewars" && mine?.correct && g.phase !== "reveal") {
      const place = solutionsRanked(g, env).findIndex((s) => s.playerId === playerId) + 1;
      out.push({ type: "result", taskId: g.taskKey, correct: true, points: 0, lockedUntil: null, place });
    }
    // Канат: если игрок ещё заблокирован после ошибки — вернуть блокировку.
    const lock = playerId ? g.locks[playerId] : undefined;
    if (g.game === "tug" && lock && lock > env.now) {
      out.push({ type: "result", taskId: g.taskKey, correct: false, points: 0, lockedUntil: lock, place: null });
    }
    if (g.phase === "reveal") {
      out.push(...revealMessages(g, task, env));
      if (playerId) {
        const place = g.game === "codewars" ? solutionsRanked(g, env).findIndex((s) => s.playerId === playerId) + 1 || null : null;
        out.push({ type: "result", taskId: g.taskKey, correct: mine?.correct ?? false, points: mine?.points ?? 0, lockedUntil: null, place });
      }
    }
  }
  // Учителю после переподключения — сводка флагов.
  if (playerId === null && g.flags) out.push({ type: "flags", flags: g.flags });
  out.push({ type: "state", state: gameState(g, env) });
  return out;
}
