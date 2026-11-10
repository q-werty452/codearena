import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { distribute, parseTasksText, type Task } from "@codearena/shared";
import { docxToText } from "./docx.ts";
import { pickFlashModel, verifyTask } from "./aiVerify.ts";

describe("Word (.docx)", () => {
  it("нумерованный список → вопросы, жирный вариант → правильный", () => {
    const text = docxToText(readFileSync(join(import.meta.dirname, "__fixtures__", "questions.docx")));
    const r = parseTasksText(text);
    expect(r.title).toBe("Теги HTML");
    expect(r.tasks.map((t) => t.type)).toEqual(["choice", "choice", "short_answer"]);
    expect(r.tasks[0]).toMatchObject({ options: ["<div>", "<a>", "<span>"], correct: 1 });
    expect(r.tasks[1]).toMatchObject({ correct: 1 });
    expect(r.tasks[2]).toMatchObject({ answers: ["href"] });
    expect(Object.keys(distribute(r.tasks))).toEqual(["quiz", "tug"]);
  });
  it("не docx — понятная ошибка", () => {
    expect(() => docxToText(new TextEncoder().encode("hello"))).toThrow("not a docx");
  });
});

describe("проверка заданий от ИИ", () => {
  const js = (p: Partial<Extract<Task, { type: "code" }>>): Task => ({
    type: "code", topic: "t", difficulty: "easy", timeLimitSec: 60, language: "javascript", prompt: "evens",
    starter: "function evens(nums) {\n}", tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }], rules: [],
    solution: "function evens(nums) { return nums.filter((n) => n % 2 === 0); }", ...p,
  });
  it("верный эталон и пустая заготовка → ok", async () => {
    expect(await verifyTask(js({}))).toBe("ok");
  });
  it("эталон с ошибкой → solution_fails с подробностями", async () => {
    const v = await verifyTask(js({ solution: "function evens(nums) { return nums; }" }));
    expect(v).toMatchObject({ reason: "solution_fails" });
    expect(typeof v === "object" && v.problem).toContain("evens([1, 2, 3, 4])");
  });
  it("заготовка уже решает задачу → starter_passes", async () => {
    expect(await verifyTask(js({ starter: "function evens(nums) { return nums.filter((n) => n % 2 === 0); }" }))).toMatchObject({ reason: "starter_passes" });
  });
  it("нет эталона → no_solution", async () => {
    expect(await verifyTask(js({ solution: undefined }))).toMatchObject({ reason: "no_solution" });
  });
  it("HTML «Исправь баг»: сломанный код не должен проходить правила", async () => {
    const t: Task = { type: "fix_bug", topic: "t", difficulty: "easy", timeLimitSec: 60, language: "html", prompt: "alt",
      code: '<img src="a.png">', tests: [], rules: [{ selector: "img", exists: true, everyHasAttr: "alt", label: "alt" }], solution: '<img src="a.png" alt="A">' };
    expect(await verifyTask(t)).toBe("ok");
    expect(await verifyTask({ ...t, code: t.solution! })).toMatchObject({ reason: "bug_passes" });
  });
});

describe("выбор модели Gemini", () => {
  const m = (...names: string[]) => names.map((name) => ({ name: `models/${name}`, supportedGenerationMethods: ["generateContent"] }));
  it("самая новая стабильная flash", () => {
    expect(pickFlashModel(m("gemini-3.6-flash", "gemini-3.10-flash", "gemini-4-flash-lite"))).toBe("gemini-3.10-flash");
    expect(pickFlashModel(m("gemini-3.1-flash-lite", "gemini-3.6-flash", "gemini-3-flash-preview", "gemini-3.10-flash-image", "gemini-2.5-flash"))).toBe("gemini-3.6-flash");
  });
  it("нет стабильной — gemini-flash-latest", () => {
    expect(pickFlashModel(m("gemini-flash-latest", "gemini-x-flash-preview"))).toBe("gemini-flash-latest");
    expect(pickFlashModel([])).toBe("gemini-flash-latest");
  });
});
