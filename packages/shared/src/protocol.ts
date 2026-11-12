import { z } from "zod";
import { Task } from "./tasks.ts";

/* ───────────────────────── Базовые сущности ───────────────────────── */

export const GameKind = z.enum(["tug", "quiz", "codewars", "race", "bug"]);
export type GameKind = z.infer<typeof GameKind>;

/** Режим деления: каждый сам за себя, 2 или 3 команды. */
export const TeamMode = z.enum(["solo", "teams2", "teams3"]);
export type TeamMode = z.infer<typeof TeamMode>;

export const TeamIndex = z.number().int().min(0).max(2);
export type TeamIndex = z.infer<typeof TeamIndex>;

export const PlayerName = z
  .string()
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(z.string().min(2).max(40));

/** Статус ученика на уроке. «Объясните ещё раз» — отдельно и анонимно. */
export const LessonStatus = z.enum(["writing", "done", "lost"]);
export type LessonStatus = z.infer<typeof LessonStatus>;

export const FlagKind = z.enum(["paste", "big_insert", "focus_lost", "ai_extension"]);
export type FlagKind = z.infer<typeof FlagKind>;

/**
 * Сводка флагов анти-чита по игроку (видит только учитель).
 * count — сколько раз; value — максимум символов (вставки) или всего секунд (уход из окна);
 * detail — последняя подробность (например, названия ИИ-расширений).
 */
export const FlagAgg = z.object({ count: z.number().int(), value: z.number(), detail: z.string() });
export type FlagAgg = z.infer<typeof FlagAgg>;
export const PlayerFlags = z.partialRecord(FlagKind, FlagAgg);
export type PlayerFlags = z.infer<typeof PlayerFlags>;

export const AntiCheatSettings = z.object({
  pasteBlock: z.boolean().default(true),
  bigInsertDetect: z.boolean().default(true),
  focusTracking: z.boolean().default(true),
  aiExtensions: z.boolean().default(true),
  /** Сколько символов можно вставить за раз. */
  pasteLimit: z.number().int().min(0).max(1000).default(30),
});
export type AntiCheatSettings = z.infer<typeof AntiCheatSettings>;

export const GameSettings = z.object({
  /** Длительность раунда (канат) или всей игры, сек. */
  roundSec: z.number().int().min(10).max(3600).default(180),
  /** Блокировка ввода после ошибки в канате, сек. */
  wrongLockSec: z.number().min(0).max(10).default(3),
  /** Время на вопрос в викторине и «найди строку», сек. */
  questionSec: z.number().int().min(5).max(300).default(20),
  /** Сколько задач в гонке. */
  raceLength: z.number().int().min(1).max(50).default(10),
  antiCheat: AntiCheatSettings.default(AntiCheatSettings.parse({})),
});
export type GameSettings = z.infer<typeof GameSettings>;

export const PlayerInfo = z.object({
  id: z.string(),
  name: z.string(),
  team: TeamIndex.nullable(),
  connected: z.boolean(),
});
export type PlayerInfo = z.infer<typeof PlayerInfo>;

export const TeamInfo = z.object({
  index: TeamIndex,
  name: z.string(),
});
export type TeamInfo = z.infer<typeof TeamInfo>;

/** Результат локального прогона тестов, который присылает расширение ученика. */
export const TestReport = z.object({
  passed: z.number().int().min(0),
  total: z.number().int().min(0),
  failures: z
    .array(z.object({ name: z.string(), expected: z.string().optional(), got: z.string().optional() }))
    .max(50)
    .default([]),
});
export type TestReport = z.infer<typeof TestReport>;

/* ───────────────────────── Клиент → сервер ───────────────────────── */

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), name: PlayerName, token: z.string().optional() }),
  z.object({
    type: z.literal("set_teams"),
    mode: TeamMode,
    /** playerId → индекс команды или null («без команды»). */
    assignment: z.record(z.string(), TeamIndex.nullable()),
  }),
  z.object({ type: z.literal("rename_team"), team: TeamIndex, name: z.string().trim().min(1).max(24) }),
  z.object({ type: z.literal("rename_player"), playerId: z.string(), name: PlayerName }),
  z.object({ type: z.literal("kick_player"), playerId: z.string() }),
  z.object({
    type: z.literal("start_game"),
    game: GameKind,
    settings: GameSettings,
    tasks: z.array(Task).min(1).max(200),
  }),
  z.object({ type: z.literal("pause") }),
  z.object({ type: z.literal("resume") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("end_game") }),
  z.object({ type: z.literal("close_room") }),
  /** Вернуться в лобби после игры (те же команды, без пересоздания комнаты). */
  z.object({ type: z.literal("reset_game") }),
  z.object({
    type: z.literal("submit"),
    taskId: z.string(),
    /** Значение: строка для short_answer, индекс для choice/best_variant, номер строки для find_line. */
    answer: z.union([z.string().max(500), z.number().int()]).optional(),
    code: z.string().max(20_000).optional(),
    report: TestReport.optional(),
  }),
  z.object({ type: z.literal("flag"), kind: FlagKind, detail: z.string().max(200).default("") }),
  /* ── Урок (режим комнаты по умолчанию) ── */
  /** Ученик: свой статус — пишу / готово / не понял. */
  z.object({ type: z.literal("status"), status: LessonStatus }),
  /** Ученик: «Объясните ещё раз» — учитель видит только количество. */
  z.object({ type: z.literal("confused") }),
  /** Учитель: новый шаг урока — статусы и «не поняли» сбрасываются. Код эталона — во второй части урока. */
  z.object({ type: z.literal("checkpoint_set"), code: z.string().max(100_000).optional(), fileName: z.string().max(200).optional() }),
  /** Учитель: текущий код показываемого файла (пачкой раз в 300–500 мс) и строка курсора. */
  z.object({ type: z.literal("lesson_share"), fileName: z.string().max(200), lang: z.string().max(40), text: z.string().max(100_000), line: z.number().int().min(0) }),
  z.object({ type: z.literal("lesson_share_stop") }),
  /** Ученик: процент по текущему чекпоинту (не чаще раза в 2 с, только при изменении). */
  z.object({ type: z.literal("progress"), checkpoint: z.number().int(), percent: z.number().min(0).max(100) }),
  /** Учитель: посмотреть код ученика. */
  z.object({ type: z.literal("peek"), playerId: z.string() }),
  /** Учитель (или телефон учителя): подсказка ученику на строке его кода. */
  z.object({
    type: z.literal("hint"),
    playerId: z.string(),
    line: z.number().int().min(1).max(100_000),
    text: z.string().trim().min(1).max(300),
    fileName: z.string().max(200).optional(),
  }),
  /** Ученик: ответ на просьбу учителя посмотреть код. */
  z.object({ type: z.literal("peek_reply"), fileName: z.string().max(200), text: z.string().max(100_000) }),
  z.object({ type: z.literal("ping") }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

/* ───────────────────────── Сервер → клиент ───────────────────────── */

export const PlayerStatus = z.enum(["idle", "thinking", "submitted", "solved", "wrong"]);
export type PlayerStatus = z.infer<typeof PlayerStatus>;

export const LeaderRow = z.object({
  id: z.string(),
  name: z.string(),
  team: TeamIndex.nullable(),
  score: z.number(),
  /** Шаги в гонке, решённые задачи и т.п. */
  progress: z.number().default(0),
});
export type LeaderRow = z.infer<typeof LeaderRow>;

export const GameState = z.object({
  game: GameKind,
  phase: z.enum(["countdown", "playing", "paused", "reveal", "over"]),
  taskIndex: z.number().int(),
  taskCount: z.number().int(),
  /** Unix ms, когда закончится текущий отсчёт (вопрос/раунд). */
  deadline: z.number().nullable(),
  /** Канат: −5 (команда 0 победила) … +5 (команда 1). */
  rope: z.number().default(0),
  teamScores: z.array(z.number()).default([]),
  leaders: z.array(LeaderRow).default([]),
  /** Сколько ответили на текущее задание и сколько всего игроков в сети. */
  answered: z.number().int().default(0),
  total: z.number().int().default(0),
  /** Сколько оставалось до дедлайна, когда учитель нажал паузу. */
  pausedLeftMs: z.number().nullable().default(null),
  /** Время сервера (ms) — клиент по нему поправляет свои часы. */
  serverNow: z.number(),
  /** Канат: кто последним дёрнул (для анимации и подписи «Айбек тянет!»). */
  lastPull: z.object({ team: TeamIndex, playerId: z.string(), name: z.string(), at: z.number() }).nullable().default(null),
  /** Победившая команда после окончания (null — ничья или не командная игра). */
  winner: TeamIndex.nullable().default(null),
});
export type GameState = z.infer<typeof GameState>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("joined"),
    playerId: z.string(),
    token: z.string(),
    team: TeamIndex.nullable(),
  }),
  z.object({
    type: z.literal("lobby"),
    code: z.string(),
    mode: TeamMode,
    teams: z.array(TeamInfo),
    players: z.array(PlayerInfo),
  }),
  z.object({ type: z.literal("game_started"), game: GameKind, settings: GameSettings }),
  z.object({
    type: z.literal("task"),
    taskId: z.string(),
    index: z.number().int(),
    /** Задание без правильного ответа (см. toPublicTask). */
    task: z.record(z.string(), z.unknown()),
    deadline: z.number().nullable(),
    limitMs: z.number().nullable().default(null),
  }),
  z.object({
    type: z.literal("result"),
    taskId: z.string(),
    correct: z.boolean(),
    points: z.number(),
    /** Unix ms, до которого ввод заблокирован (штраф в канате). */
    lockedUntil: z.number().nullable().default(null),
    /** Место в списке правильных решений (Codewars). */
    place: z.number().int().nullable().default(null),
  }),
  z.object({ type: z.literal("state"), state: GameState }),
  z.object({
    type: z.literal("reveal"),
    taskId: z.string(),
    answer: z.unknown(),
    explanation: z.string().optional(),
    /** Сколько человек выбрали каждый вариант. */
    stats: z.array(z.number()).optional(),
    /** Правильные решения (Codewars) — показываются всем после раунда. */
    solutions: z
      .array(z.object({ playerId: z.string(), name: z.string(), code: z.string(), length: z.number() }))
      .optional(),
  }),
  z.object({
    type: z.literal("teacher_feed"),
    event: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("submission"),
        playerId: z.string(),
        taskId: z.string(),
        correct: z.boolean(),
        answer: z.unknown().optional(),
        code: z.string().optional(),
        report: TestReport.optional(),
        at: z.number(),
      }),
      z.object({
        kind: z.literal("flag"),
        playerId: z.string(),
        flag: FlagKind,
        detail: z.string(),
        at: z.number(),
      }),
      z.object({ kind: z.literal("status"), playerId: z.string(), status: PlayerStatus }),
    ]),
  }),
  z.object({ type: z.literal("game_over"), leaders: z.array(LeaderRow), teamScores: z.array(z.number()) }),
  z.object({ type: z.literal("kicked") }),
  /** Учителю: флаги анти-чита всех игроков текущей игры. */
  z.object({ type: z.literal("flags"), flags: z.record(z.string(), PlayerFlags) }),
  z.object({ type: z.literal("room_closed") }),
  /** Учителю: сводка урока (статусы всех, анонимное число «объясните ещё раз»). */
  z.object({
    type: z.literal("lesson_state"),
    checkpoint: z.number().int(),
    statuses: z.record(z.string(), LessonStatus),
    confused: z.number().int(),
    progress: z.record(z.string(), z.number()).default({}),
  }),
  /** Ученику: его собственное состояние урока (после входа, переподключения и нового шага). */
  z.object({ type: z.literal("lesson_me"), checkpoint: z.number().int(), status: LessonStatus, confused: z.boolean() }),
  /** Ученикам: код учителя (показываемый файл). */
  z.object({ type: z.literal("lesson_share"), fileName: z.string(), lang: z.string(), text: z.string(), line: z.number().int(), version: z.number().int() }),
  z.object({ type: z.literal("lesson_share_off") }),
  /** Ученикам: эталон текущего чекпоинта — с ним сравнивается файл урока. */
  z.object({ type: z.literal("checkpoint"), checkpoint: z.number().int(), fileName: z.string(), code: z.string() }),
  /** Ученику: учитель просит показать код. */
  z.object({ type: z.literal("peek_request") }),
  /** Ученику: подсказка учителя на строке (номер с 1). */
  z.object({ type: z.literal("hint"), line: z.number().int(), text: z.string(), fileName: z.string().default("") }),
  /** Тому, кто отправил подсказку: дошла до ученика. */
  z.object({ type: z.literal("hint_sent"), playerId: z.string(), line: z.number().int(), text: z.string() }),
  /** Учителю: код ученика. */
  z.object({ type: z.literal("peek_code"), playerId: z.string(), name: z.string(), fileName: z.string(), text: z.string() }),
  z.object({ type: z.literal("game_reset") }),
  /** Сервер принял ответ ученика (правильность станет известна при показе). */
  z.object({ type: z.literal("answered"), taskId: z.string(), answer: z.union([z.string(), z.number()]) }),
  z.object({ type: z.literal("error"), code: ErrorCodeSchema(), message: z.string() }),
  z.object({ type: z.literal("pong"), t: z.number() }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;

function ErrorCodeSchema() {
  return z.enum([
    "bad_message",
    "room_not_found",
    "name_taken",
    "not_teacher",
    "not_joined",
    "game_running",
    "no_game",
    "locked",
    "unknown_task",
    "invalid_settings",
    "invalid_tasks",
    "already_answered",
    "need_two_teams",
    "no_team",
  ]);
}
export type ErrorCode = z.infer<ReturnType<typeof ErrorCodeSchema>>;

/* ───────────────────────── HTTP ───────────────────────── */

export const CreateRoomResponse = z.object({
  code: z.string().regex(/^\d{6}$/),
  teacherToken: z.string(),
});
export type CreateRoomResponse = z.infer<typeof CreateRoomResponse>;

/** Разбирает и валидирует входящее сообщение. Возвращает null при мусоре. */
export function parseClientMessage(raw: unknown): ClientMessage | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = ClientMessage.safeParse(data);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function parseServerMessage(raw: unknown): ServerMessage | null {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    const r = ServerMessage.safeParse(data);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}
