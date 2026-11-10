/**
 * Реестр модулей запуска. Чтобы добавить язык (например, Dart),
 * напишите runners/dart.ts с объектом Runner и добавьте его в RUNNERS.
 */
import type { CodeTest, Language, TestReport } from "@codearena/shared";
import { javascriptRunner } from "./javascript.ts";
import { pythonRunner } from "./python.ts";
import { dartRunner } from "./dart.ts";
import { cssRunner, htmlRunner } from "./web.ts";
import type { Checks, RunOutcome, Runner } from "./types.ts";

export type { Checks, RunOutcome, Runner } from "./types.ts";
export { RUN_TIMEOUT_MS } from "./types.ts";

const RUNNERS: Runner[] = [htmlRunner, cssRunner, javascriptRunner, pythonRunner, dartRunner];

export function getRunner(language: Language): Runner | null {
  return RUNNERS.find((r) => r.languages.includes(language)) ?? null;
}

export async function runChecks(language: Language, code: string, checks: Checks): Promise<RunOutcome> {
  const runner = getRunner(language);
  if (!runner) return { results: [], error: "no_runtime", message: `No runner for ${language}` };
  return runner.run(code, checks);
}

/** Сжатый отчёт для сервера: сколько проверок прошло и какие упали. */
export function toReport(o: RunOutcome, checks: Checks): TestReport {
  const names = [...checks.tests.map((t) => ({ name: t.call, expected: t.expected })), ...checks.rules.map((r) => ({ name: r.label, expected: "" }))];
  const failures = o.error
    ? names.map((n) => ({ ...n, got: o.error ?? undefined }))
    : o.results.filter((r) => !r.ok).map((r) => ({ name: r.call, expected: r.expected, got: r.got }));
  return {
    passed: o.error ? 0 : o.results.filter((r) => r.ok).length,
    total: names.length,
    failures: failures.slice(0, 50).map((f) => ({ name: f.name.slice(0, 200), expected: f.expected?.slice(0, 200), got: f.got?.slice(0, 200) })),
  };
}

/** Прогон только тестов-вызовов (удобно в тестах и для JS/Python). */
export function runTests(language: Language, code: string, tests: CodeTest[]): Promise<RunOutcome> {
  return runChecks(language, code, { tests, rules: [] });
}
