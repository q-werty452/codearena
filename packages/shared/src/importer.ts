import { hasChecks, Task, TaskSet, type Task as TaskT } from "./tasks.ts";
import type { GameKind } from "./protocol.ts";

/**
 * Свои задания учителя: файл (JSON, текст, Word) → задания → раскладка по играм.
 *
 * Раскладка по типу:
 *   вопрос с вариантами          → Викторина
 *   короткий ответ               → Канат
 *   код с тестами/правилами      → Codewars
 *   найди строку / лучший вариант / исправь баг → «Найди баг»
 * Гонка берёт задания из Викторины, Каната и Codewars.
 */
export type ImportGame = "quiz" | "tug" | "codewars" | "bug";
export const IMPORT_GAMES: readonly ImportGame[] = ["quiz", "tug", "codewars", "bug"];

export interface SkippedTask {
  /** Номер задания в файле (с 1) или кусок текста. */
  where: string;
  reason: SkipReason;
  detail?: string;
}
export type SkipReason = "invalid" | "no_correct" | "too_many_options" | "few_options" | "no_checks" | "no_answer" | "solution_fails" | "starter_passes" | "bug_passes" | "no_solution";

export interface ParsedTasks {
  format: "json" | "text" | "none";
  title: string;
  tasks: TaskT[];
  skipped: SkippedTask[];
  /** Набор был сохранён для конкретной игры (например, гонки). */
  game?: GameKind;
}

/** В какую игру идёт задание; null — некуда (код без проверок). */
export function gameForTask(t: TaskT): ImportGame | null {
  switch (t.type) {
    case "choice":
      return "quiz";
    case "short_answer":
      return "tug";
    case "code":
      return hasChecks(t) ? "codewars" : null;
    case "find_line":
    case "best_variant":
      return "bug";
    case "fix_bug":
      return hasChecks(t) ? "bug" : null;
  }
}

/** Какие типы заданий играет игра. */
export function fitsGame(game: GameKind, t: TaskT): boolean {
  if (game === "race") return t.type === "choice" || t.type === "short_answer" || (t.type === "code" && hasChecks(t));
  return gameForTask(t) === game;
}

/** Разложить задания по играм. Набор, сохранённый для гонки, целиком остаётся гонке. */
export function distribute(tasks: TaskT[], game?: GameKind): Partial<Record<GameKind, TaskT[]>> {
  if (game === "race" && tasks.length && tasks.every((t) => fitsGame("race", t))) return { race: tasks };
  const out: Partial<Record<GameKind, TaskT[]>> = {};
  for (const t of tasks) {
    const g = gameForTask(t);
    if (g) (out[g] ??= []).push(t);
  }
  return out;
}

/* ───────────────────────── JSON ───────────────────────── */

const FALLBACK_TOPIC = "Мои задания";

/**
 * Свободный JSON → задание: тип угадывается по полям, тема по умолчанию — название набора.
 * Так проходят и наборы CodeArena, и «примерно похожие» файлы (например, от ИИ).
 */
export function looseTask(raw: unknown, topic: string): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const r = { ...(raw as Record<string, unknown>) };
  if (typeof r.question === "string" && r.prompt === undefined) r.prompt = r.question;
  if (Array.isArray(r.answers) && typeof r.answer === "string") r.answers = [...r.answers, r.answer];
  if (typeof r.answer === "string" && r.answers === undefined && !Array.isArray(r.options)) r.answers = [r.answer];
  if (r.type === undefined) {
    if (Array.isArray(r.options)) r.type = "choice";
    else if (Array.isArray(r.variants)) r.type = "best_variant";
    else if (Array.isArray(r.answers)) r.type = "short_answer";
    else if (typeof r.line === "number" && typeof r.code === "string") r.type = "find_line";
    else if (typeof r.code === "string" && (r.tests || r.rules)) r.type = "fix_bug";
    else if (typeof r.starter === "string" || r.tests || r.rules) r.type = "code";
  }
  // Ответ текстом вместо индекса: «correct: "<a>"».
  if (r.type === "choice" && Array.isArray(r.options)) {
    const opts = r.options.map((o) => String(o).trim());
    r.options = opts;
    if (typeof r.correct === "string") r.correct = opts.indexOf(r.correct.trim());
    if (r.correct === undefined && typeof r.answer === "string") r.correct = opts.indexOf(r.answer.trim());
    if (r.correct === undefined && typeof r.answer === "number") r.correct = r.answer;
  }
  if (typeof r.topic !== "string" || !r.topic.trim()) r.topic = topic || FALLBACK_TOPIC;
  if ((r.type === "code" || r.type === "fix_bug") && typeof r.starter !== "string" && r.type === "code") r.starter = "";
  return r;
}

/** Задание из JSON: ошибка схемы → понятная причина пропуска. */
function acceptTask(raw: unknown, topic: string, where: string, tasks: TaskT[], skipped: SkippedTask[]): void {
  const r = Task.safeParse(looseTask(raw, topic));
  if (!r.success) {
    const issue = r.error.issues[0];
    const path = issue?.path.join(".") ?? "";
    const reason: SkipReason = path === "correct" ? "no_correct" : path === "options" && issue?.code === "too_big" ? "too_many_options" : path === "options" ? "few_options" : "invalid";
    skipped.push({ where, reason, detail: `${path ? path + ": " : ""}${issue?.message ?? ""}` });
    return;
  }
  const t = r.data;
  if ((t.type === "code" || t.type === "fix_bug") && !hasChecks(t)) {
    skipped.push({ where, reason: "no_checks" });
    return;
  }
  tasks.push(t);
}

function parseJson(text: string): ParsedTasks | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const obj = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  const list = Array.isArray(raw) ? raw : Array.isArray(obj?.tasks) ? (obj.tasks as unknown[]) : Array.isArray(obj?.questions) ? (obj.questions as unknown[]) : null;
  if (!list) return { format: "json", title: "", tasks: [], skipped: [{ where: "JSON", reason: "invalid", detail: "no tasks array" }] };
  const title = typeof obj?.title === "string" ? obj.title : "";
  const game = TaskSet.shape.game.safeParse(obj?.game).data;
  const tasks: TaskT[] = [];
  const skipped: SkippedTask[] = [];
  list.forEach((x, i) => acceptTask(x, title, `#${i + 1}`, tasks, skipped));
  return { format: "json", title, tasks, skipped, game };
}

/* ───────────────────────── Текст ───────────────────────── */

/*
 * Текстовый формат (подходит и для Word):
 *
 *   # Тема: Ссылки и списки           ← тема для следующих вопросов (необязательно)
 *
 *   1. Какой тег создаёт ссылку?      ← вопрос: «1.», «1)», «?» или «Вопрос:»
 *   - <div>
 *   + <a>                             ← «+» или «*» — правильный вариант
 *   - <span>
 *
 *   2. Каким свойством меняют цвет текста?
 *   = color | colour                  ← короткий ответ (варианты через |)
 *
 *   3. Тег абзаца?
 *   a) <p>
 *   b) <br>
 *   Ответ: a                          ← или правильный вариант буквой/текстом
 */
const Q_RE = /^\s*(?:(?:вопрос|question|q)\s*\d*\s*[:.)]|\d{1,3}\s*[.)]|\?)\s*(.+)$/i;
const OPT_RE = /^\s*(?:([-+*•✓✔])|\[([ xх✓]?)\]|([a-fа-е])\s*[).])\s+(.+)$/i;
const ANS_RE = /^\s*(?:=|(?:правильный\s+ответ|ответ|answer|correct)\s*[:=-])\s*(.+)$/i;
const TOPIC_RE = /^\s*(?:#{1,6}\s*(?:(?:тема|topic)\s*[:.-]\s*)?|(?:тема|topic)\s*[:.-]\s*)(.+)$/i;
const CORRECT_TAIL = /\s*(?:\(\s*(?:верно|правильно|correct|true|\+)\s*\)|\*|✓|✔|\+)\s*$/i;
const LETTERS = "abcdef";
const RU_LETTERS = "абвгде";

interface Block {
  where: string;
  prompt: string[];
  options: { text: string; correct: boolean; sign?: string; tail: boolean }[];
  answers: string[];
  topic: string;
  inCode: boolean;
}

function letterIndex(s: string): number {
  const c = s.trim().toLowerCase().replace(/[).]$/, "");
  if (c.length !== 1) return -1;
  const i = LETTERS.indexOf(c);
  return i >= 0 ? i : RU_LETTERS.indexOf(c);
}

function finishBlock(b: Block, tasks: TaskT[], skipped: SkippedTask[]): void {
  const prompt = b.prompt.join("\n").trim();
  if (!prompt && !b.options.length && !b.answers.length) return;
  const base = { topic: b.topic || FALLBACK_TOPIC, difficulty: "easy" as const, prompt };
  if (!prompt) return void skipped.push({ where: b.where, reason: "invalid", detail: "no question text" });

  if (b.options.length) {
    // «* вариант» у всех — это просто маркеры списка, а не отметка правильного.
    if (b.options.length > 1 && b.options.every((o) => o.sign === "*")) b.options.forEach((o) => (o.correct = o.tail));
    const options = b.options.map((o) => o.text);
    let correct = b.options.findIndex((o) => o.correct);
    // «Ответ: b» / «Ответ: <a>» / «Ответ: 2».
    for (const a of b.answers) {
      if (correct >= 0) break;
      const li = letterIndex(a);
      if (li >= 0 && li < options.length) correct = li;
      else if (/^\d$/.test(a.trim()) && Number(a) >= 1 && Number(a) <= options.length) correct = Number(a) - 1;
      else correct = options.findIndex((o) => o.toLowerCase() === a.trim().toLowerCase());
    }
    if (options.length < 2) return void skipped.push({ where: b.where, reason: "few_options" });
    if (options.length > 4) return void skipped.push({ where: b.where, reason: "too_many_options" });
    if (correct < 0) return void skipped.push({ where: b.where, reason: "no_correct" });
    if (b.options.filter((o) => o.correct).length > 1) return void skipped.push({ where: b.where, reason: "no_correct", detail: "several marked" });
    tasks.push(Task.parse({ ...base, type: "choice", timeLimitSec: 20, options, correct }));
    return;
  }
  const answers = b.answers.flatMap((a) => a.split("|")).map((a) => a.trim()).filter(Boolean);
  if (!answers.length) return void skipped.push({ where: b.where, reason: "no_answer" });
  tasks.push(Task.parse({ ...base, type: "short_answer", timeLimitSec: 60, answers }));
}

function parseText(text: string): ParsedTasks {
  const tasks: TaskT[] = [];
  const skipped: SkippedTask[] = [];
  let title = "";
  let topic = "";
  let n = 0;
  let b: Block | null = null;
  const start = (first: string) => {
    if (b) finishBlock(b, tasks, skipped);
    n++;
    b = { where: `#${n} «${first.slice(0, 40)}»`, prompt: [first], options: [], answers: [], topic, inCode: false };
  };

  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.replace(/ /g, " ");
    const cur = b as Block | null;
    // Код внутри вопроса — как есть, до закрывающих ```.
    if (cur && /^\s*```/.test(line)) {
      cur.inCode = !cur.inCode;
      cur.prompt.push(line.trim());
      continue;
    }
    if (cur?.inCode) {
      cur.prompt.push(line);
      continue;
    }
    if (!line.trim()) {
      if (cur && (cur.options.length || cur.answers.length)) {
        finishBlock(cur, tasks, skipped);
        b = null;
      }
      continue;
    }
    const tm = TOPIC_RE.exec(line);
    if (tm && (/^\s*#/.test(line) || !cur || cur.options.length || cur.answers.length)) {
      if (cur) finishBlock(cur, tasks, skipped);
      b = null;
      topic = tm[1]!.trim();
      if (!title) title = topic;
      continue;
    }
    const am = ANS_RE.exec(line);
    if (am && cur) {
      cur.answers.push(am[1]!.trim());
      continue;
    }
    const om = OPT_RE.exec(line);
    if (om && cur) {
      const [, sign, box, , body] = om;
      let textOpt = body!.trim();
      const tail = CORRECT_TAIL.test(textOpt);
      if (tail) textOpt = textOpt.replace(CORRECT_TAIL, "").trim();
      const correct = tail || sign === "+" || sign === "*" || sign === "✓" || sign === "✔" || (box !== undefined && box.trim() !== "");
      cur.options.push({ text: textOpt, correct, sign, tail });
      continue;
    }
    const qm = Q_RE.exec(line);
    if (qm) {
      start(qm[1]!.trim());
      continue;
    }
    // Продолжение вопроса или новый вопрос без номера (после завершённого).
    if (cur && !cur.options.length && !cur.answers.length) cur.prompt.push(line.trim());
    else start(line.trim());
  }
  if (b) finishBlock(b, tasks, skipped);
  const format = tasks.length ? "text" : "none";
  return { format, title, tasks, skipped: format === "none" ? [] : skipped };
}

/** Текст файла → задания. JSON распознаётся по содержимому, остальное — как текст с вопросами. */
export function parseTasksText(text: string): ParsedTasks {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    const j = parseJson(trimmed);
    if (j) return j;
  }
  return parseText(text);
}

/** Задания из списка: валидация по одному (для ответа ИИ и сохранённой библиотеки). */
export function acceptTasks(list: unknown[], topic: string): { tasks: TaskT[]; skipped: SkippedTask[] } {
  const tasks: TaskT[] = [];
  const skipped: SkippedTask[] = [];
  list.forEach((x, i) => acceptTask(x, topic, `#${i + 1}`, tasks, skipped));
  return { tasks, skipped };
}
