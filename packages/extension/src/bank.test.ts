/**
 * Проверка банка задач (папка tasks/): формат, количество, и главное —
 * каждое задание с кодом решаемо: сломанный код/заготовка НЕ проходит
 * проверки, эталонное решение проходит ВСЕ.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { TaskSet, type Task } from "@codearena/shared";
import { runChecks } from "./runner.ts";

const ROOT = join(import.meta.dirname, "../../../tasks");

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? jsonFiles(p) : f.endsWith(".json") ? [p] : [];
  });
}

const ALLOWED: Record<string, Task["type"][]> = {
  quiz: ["choice"],
  tug: ["short_answer"],
  codewars: ["code"],
  bug: ["find_line", "fix_bug", "best_variant"],
  race: ["short_answer", "choice", "code"],
};

const files = jsonFiles(ROOT);

describe("банк задач", () => {
  it("в банке есть наборы", () => expect(files.length).toBeGreaterThanOrEqual(4));

  for (const file of files) {
    const name = relative(ROOT, file);
    const set = TaskSet.parse(JSON.parse(readFileSync(file, "utf8")));

    describe(name, () => {
      it("формат, игра, 15+ заданий, подходящие виды", () => {
        expect(set.game).toBeDefined();
        expect(set.title.length).toBeGreaterThan(3);
        expect(set.tasks.length).toBeGreaterThanOrEqual(15);
        for (const t of set.tasks) expect(ALLOWED[set.game!]).toContain(t.type);
      });

      it("правильные ответы не стоят всё время на одном месте", () => {
        const idx = set.tasks.flatMap((t) => (t.type === "choice" || t.type === "best_variant" ? [t.correct] : []));
        if (idx.length >= 4) expect(new Set(idx).size).toBeGreaterThan(1);
      });

      for (const [i, t] of set.tasks.entries()) {
        if (t.type === "find_line") {
          it(`#${i + 1} найди строку: номер строки в пределах кода`, () => {
            expect(t.line).toBeGreaterThanOrEqual(1);
            expect(t.line).toBeLessThanOrEqual(t.code.split("\n").length);
          });
        }
        if (t.type === "fix_bug" || t.type === "code") {
          it(`#${i + 1} ${t.type}: сломанное не проходит, эталон проходит`, async () => {
            expect(t.solution, "нужно эталонное решение").toBeTruthy();
            const checks = { tests: t.tests, rules: t.rules };
            const broken = await runChecks(t.language, t.type === "fix_bug" ? t.code : t.starter, checks);
            const fixed = await runChecks(t.language, t.solution!, checks);
            expect(fixed.error, fixed.message).toBeNull();
            const failedFixed = fixed.results.filter((r) => !r.ok).map((r) => `${r.call}: ${r.got}`);
            expect(failedFixed, "эталон не прошёл").toEqual([]);
            expect(fixed.results.length).toBe(t.tests.length + t.rules.length);
            expect(broken.error !== null || broken.results.some((r) => !r.ok), "сломанный код уже проходит все проверки").toBe(true);
          });
        }
      }
    });
  }
});
