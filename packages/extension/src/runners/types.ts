/**
 * Общий интерфейс модулей запуска. Каждый язык — отдельный модуль с
 * run(code, checks) → результаты. Новый язык (например, Dart через `dart`
 * ученика) добавляется одним модулем и строкой в runners/index.ts.
 */
import type { CodeTest, HtmlRule, Language, TestResult } from "@codearena/shared";

export const RUN_TIMEOUT_MS = 5000;

/** Что проверять: тесты-вызовы (JS/Python/Dart) и/или правила (HTML/CSS). */
export interface Checks {
  tests: CodeTest[];
  rules: HtmlRule[];
}

export interface RunOutcome {
  results: TestResult[];
  /**
   * no_python / no_runtime — у ученика не установлен нужный интерпретатор;
   * timeout — дольше 5 с; compile — ошибка в коде до запуска тестов.
   */
  error: null | "no_python" | "no_dart" | "no_runtime" | "timeout" | "compile";
  message?: string;
}

export interface Runner {
  readonly languages: readonly Language[];
  run(code: string, checks: Checks): Promise<RunOutcome>;
}
