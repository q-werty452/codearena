import { describe, expect, it } from "vitest";
import { extractSolution, taskFileContent, type CodeTask } from "./taskFile.ts";
import { runTests } from "./runner.ts";

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
