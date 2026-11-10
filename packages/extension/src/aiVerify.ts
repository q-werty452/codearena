import type { SkippedTask, Task } from "@codearena/shared";
import { runChecks } from "./runner.ts";

/** Проверки заданий от ИИ без VS Code API — тестируются обычным vitest. */

/** Самая новая стабильная «gemini-X.Y-flash» (без lite/preview/image/tts/live). */
export function pickFlashModel(models: { name: string; supportedGenerationMethods?: string[] }[]): string {
  const ver = (n: string) => /^gemini-(\d+(?:\.\d+)?)-flash$/.exec(n)?.[1];
  const names = models
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""));
  const stable = names.filter((n) => ver(n) !== undefined).sort((a, b) => {
      const [x, y] = [ver(a)!.split(".").map(Number), ver(b)!.split(".").map(Number)];
      return (y[0]! - x[0]!) || ((y[1] ?? 0) - (x[1] ?? 0));
    });
  if (stable[0]) return stable[0];
  if (names.includes("gemini-flash-latest")) return "gemini-flash-latest";
  return names.find((n) => /flash/.test(n) && !/lite|image|tts|live|audio|embed/.test(n)) ?? "gemini-flash-latest";
}

export type Verdict = "ok" | "unverified" | { problem: string; reason: SkippedTask["reason"] };

/** Задача с кодом от ИИ: эталон обязан проходить, заготовка — нет. */
export async function verifyTask(t: Task): Promise<Verdict> {
  if (t.type !== "code" && t.type !== "fix_bug") return "ok";
  const checks = { tests: t.tests, rules: t.rules };
  if (!t.solution?.trim()) return { problem: "no reference solution", reason: "no_solution" };
  const sol = await runChecks(t.language, t.solution, checks);
  if (sol.error === "no_python" || sol.error === "no_runtime") return "unverified";
  const passed = (o: typeof sol) => !o.error && o.results.length > 0 && o.results.every((r) => r.ok);
  if (!passed(sol)) {
    const fails = sol.error ? `${sol.error}: ${sol.message ?? ""}` : sol.results.filter((r) => !r.ok).map((r) => `${r.call} → got ${r.got}, expected ${r.expected}`).join("; ");
    return { problem: `reference solution fails: ${fails}`.slice(0, 400), reason: "solution_fails" };
  }
  const start = await runChecks(t.language, t.type === "code" ? t.starter : t.code, checks);
  if (passed(start)) return { problem: t.type === "code" ? "starter already passes all checks" : "buggy code already passes all checks", reason: t.type === "code" ? "starter_passes" : "bug_passes" };
  return "ok";
}
