import { describe, expect, it } from "vitest";
import { extractSolution, taskFileContent, type CodeTask, type FixTask } from "./taskFile.ts";
import { runChecks, runTests } from "./runner.ts";

const task: CodeTask = {
  id: "t0",
  type: "code",
  topic: "Списки",
  difficulty: "easy",
  timeLimitSec: 300,
  language: "python",
  prompt: "Верни список только чётных чисел из nums.",
  starter: "def evens(nums):\n    pass",
  tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }],
  rules: [],
};

describe("файл задачи", () => {
  it("шапка в комментариях, решение ниже разделителя", () => {
    const text = taskFileContent(task, 0, true);
    expect(text).toContain("# Верни список только чётных чисел из nums.");
    expect(text).toContain("#   evens([1, 2, 3, 4])  →  [2, 4]");
    expect(extractSolution(text)).toBe("def evens(nums):\n    pass\n");
  });

  it("шапка не выполняется и не влияет на результат", async () => {
    const text = taskFileContent(task, 0, false).replace("    pass", "    return [n for n in nums if n % 2 == 0]");
    const r = await runTests("python", extractSolution(text), task.tests);
    expect(r.results[0]!.ok).toBe(true);
  });

  it("JS-комментарии и длинное условие переносится", () => {
    const text = taskFileContent({ ...task, language: "javascript", prompt: "a ".repeat(60).trim() }, 2, false);
    expect(text.split("\n")[0]).toBe("// CodeArena · Task 3");
    expect(text.split("\n").every((l) => l.length <= 90)).toBe(true);
  });
});

describe("файл задачи HTML/CSS и «Исправь баг»", () => {
  const rules = [{ selector: "footer", exists: true, label: "есть footer" }];
  it("HTML: шапка в <!-- -->, сломанный код ниже, проверка правилами", async () => {
    const fix: FixTask = {
      id: "t1", type: "fix_bug", topic: "HTML", difficulty: "easy", timeLimitSec: 120, language: "html",
      prompt: "Замени div на семантический тег.", code: '<div class="footer">© 2026</div>', tests: [], rules,
    };
    const text = taskFileContent(fix, 0, true);
    expect(text.startsWith("<!-- CodeArena · Исправь баг 1")).toBe(true);
    expect(text).toContain("•  есть footer".replace("•  ", "• "));
    expect(text).toMatch(/─── CodeArena ─── пиши решение ниже -->/);
    const broken = extractSolution(text);
    expect(broken.trim()).toBe('<div class="footer">© 2026</div>');
    expect((await runChecks("html", broken, { tests: [], rules })).results[0]!.ok).toBe(false);
    expect((await runChecks("html", "<footer>© 2026</footer>", { tests: [], rules })).results[0]!.ok).toBe(true);
  });

  it("CSS: шапка в /* */", () => {
    const text = taskFileContent({ ...task, language: "css", starter: ".card {}", rules: [{ selector: ".card", exists: true, label: "flex", css: { property: "display", value: "flex" } }] }, 0, false);
    expect(text.split("\n")[0]).toBe("/* CodeArena · Task 1");
    expect(text).toMatch(/\*\/\n\n\.card \{\}/);
    expect(extractSolution(text)).toBe(".card {}\n");
  });
});
