import { z } from "zod";

/**
 * Языки заданий. Приоритет — фронтенд: HTML/CSS → JavaScript → Python.
 * Dart (Flutter) — только для показа кода (найди строку, выбери лучший), без запуска.
 */
export const Language = z.enum(["html", "css", "javascript", "python", "dart"]);
export type Language = z.infer<typeof Language>;

/** Языки, код на которых проверяется у ученика (есть раннер). */
export const RUNNABLE_LANGUAGES: ReadonlySet<Language> = new Set(["html", "css", "javascript", "python"]);
/** Языки, где проверка — правила по селекторам, а не тесты-вызовы. */
export const RULE_LANGUAGES: ReadonlySet<Language> = new Set(["html", "css"]);

export const Difficulty = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof Difficulty>;

/** Общие поля любого задания. */
const base = {
  id: z.string().min(1).optional(),
  topic: z.string().min(1),
  difficulty: Difficulty.default("easy"),
  timeLimitSec: z.number().int().min(5).max(3600).default(60),
  explanation: z.string().optional(),
};

/** Тест для задания с кодом: вызов и ожидаемое значение (литерал на языке задания). */
export const CodeTest = z.object({
  call: z.string().min(1),
  expected: z.string(),
});
export type CodeTest = z.infer<typeof CodeTest>;

/**
 * Правило для HTML/CSS. Без `css` — проверка разметки по CSS-селектору
 * («есть footer», «у каждого img есть alt», «нет div.footer»).
 * С `css` — проверка таблицы стилей: в правиле с этим селектором есть
 * (или нет, если exists: false) свойство с нужным значением.
 */
export const HtmlRule = z.object({
  selector: z.string().min(1),
  /** true — элемент/свойство обязано быть; false — быть не должно. */
  exists: z.boolean().default(true),
  /** Каждый найденный элемент обязан иметь этот атрибут (например, alt у img). */
  everyHasAttr: z.string().optional(),
  /** Минимальное количество найденных элементов. */
  minCount: z.number().int().min(1).optional(),
  /** Текст элемента должен содержать эту строку (без учёта регистра). */
  text: z.string().optional(),
  /** Проверка CSS: свойство (и, если задано, значение) в правиле с этим селектором. */
  css: z.object({ property: z.string().min(1), value: z.string().optional() }).optional(),
  /** Человеческое описание: «есть footer», «у .card display: flex». */
  label: z.string().min(1),
});
export type HtmlRule = z.infer<typeof HtmlRule>;

export const ShortAnswerTask = z.object({
  ...base,
  type: z.literal("short_answer"),
  prompt: z.string().min(1),
  answers: z.array(z.string().min(1)).min(1),
  caseSensitive: z.boolean().default(false),
});

export const ChoiceTask = z.object({
  ...base,
  type: z.literal("choice"),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2).max(4),
  correct: z.number().int().min(0).max(3),
});

export const CodeTask = z.object({
  ...base,
  type: z.literal("code"),
  language: Language,
  prompt: z.string().min(1),
  starter: z.string(),
  tests: z.array(CodeTest).default([]),
  rules: z.array(HtmlRule).default([]),
  /** Эталонное решение (используется при ИИ-генерации, ученикам не уходит). */
  solution: z.string().optional(),
});

export const FindLineTask = z.object({
  ...base,
  type: z.literal("find_line"),
  language: Language,
  prompt: z.string().default("Найди строку с ошибкой"),
  code: z.string().min(1),
  /** Номер строки с багом, с 1. */
  line: z.number().int().min(1),
});

export const FixBugTask = z.object({
  ...base,
  type: z.literal("fix_bug"),
  language: Language,
  prompt: z.string().default("Исправь ошибку"),
  code: z.string().min(1),
  tests: z.array(CodeTest).default([]),
  rules: z.array(HtmlRule).default([]),
  solution: z.string().optional(),
});

export const BestVariantTask = z.object({
  ...base,
  type: z.literal("best_variant"),
  language: Language,
  prompt: z.string().default("Какой вариант лучше?"),
  variants: z.array(z.string().min(1)).min(2).max(4),
  correct: z.number().int().min(0).max(3),
});

export const Task = z
  .discriminatedUnion("type", [
    ShortAnswerTask,
    ChoiceTask,
    CodeTask,
    FindLineTask,
    FixBugTask,
    BestVariantTask,
  ])
  .superRefine((t, ctx) => {
    if ((t.type === "choice" && t.correct >= t.options.length) ||
        (t.type === "best_variant" && t.correct >= t.variants.length)) {
      ctx.addIssue({ code: "custom", message: "correct index out of range", path: ["correct"] });
    }
    if (t.type === "find_line" && t.line > t.code.split("\n").length) {
      ctx.addIssue({ code: "custom", message: "line out of range", path: ["line"] });
    }
  });
export type Task = z.infer<typeof Task>;
export type TaskType = Task["type"];

/** Набор заданий, который учитель сохраняет в файл и загружает снова. */
export const TaskSet = z.object({
  version: z.literal(1).default(1),
  title: z.string().default(""),
  /** Для какой игры набор (банк задач показывает подходящие). */
  game: z.enum(["quiz", "tug", "codewars", "race", "bug"]).optional(),
  description: z.string().optional(),
  /** Автор набора — GitHub-ник, чтобы учителя видели, кто прислал задания. */
  author: z.string().optional(),
  tasks: z.array(Task),
});
export type TaskSet = z.infer<typeof TaskSet>;

/** Задания, ответ на которые проверяет сервер. */
export const SERVER_CHECKED: ReadonlySet<TaskType> = new Set([
  "short_answer",
  "choice",
  "find_line",
  "best_variant",
]);

export function isServerChecked(t: Task): boolean {
  return SERVER_CHECKED.has(t.type);
}

/**
 * Версия задания для учеников: без правильного ответа, эталона и объяснения.
 * Для заданий с кодом видимые тесты остаются — проверка локальная.
 */
export type PublicTask =
  | Omit<Extract<Task, { type: "short_answer" }>, "answers" | "caseSensitive" | "explanation">
  | Omit<Extract<Task, { type: "choice" }>, "correct" | "explanation">
  | Omit<Extract<Task, { type: "code" }>, "solution" | "explanation">
  | Omit<Extract<Task, { type: "find_line" }>, "line" | "explanation">
  | Omit<Extract<Task, { type: "fix_bug" }>, "solution" | "explanation">
  | Omit<Extract<Task, { type: "best_variant" }>, "correct" | "explanation">;

export function toPublicTask(t: Task): PublicTask {
  switch (t.type) {
    case "short_answer": {
      const { answers: _a, caseSensitive: _c, explanation: _e, ...rest } = t;
      return rest;
    }
    case "choice":
    case "best_variant": {
      const { correct: _c, explanation: _e, ...rest } = t;
      return rest;
    }
    case "find_line": {
      const { line: _l, explanation: _e, ...rest } = t;
      return rest;
    }
    case "code":
    case "fix_bug": {
      const { solution: _s, explanation: _e, ...rest } = t;
      return rest;
    }
  }
}
