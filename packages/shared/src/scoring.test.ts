import { describe, expect, it } from "vitest";
import {
  checkShortAnswer,
  codewarsPoints,
  pullRope,
  quizPoints,
  rankSolutions,
  ropeWinner,
  shuffleIntoTeams,
  solutionLength,
  teamAverage,
} from "./scoring.ts";
import { Task, toPublicTask } from "./tasks.ts";
import { parseClientMessage } from "./protocol.ts";

describe("quizPoints", () => {
  it("мгновенный ответ = 1000, на последней секунде = 500", () => {
    expect(quizPoints(0, 20_000, true)).toBe(1000);
    expect(quizPoints(20_000, 20_000, true)).toBe(500);
    expect(quizPoints(10_000, 20_000, true)).toBe(750);
  });
  it("неправильно или опоздал = 0", () => {
    expect(quizPoints(1000, 20_000, false)).toBe(0);
    expect(quizPoints(21_000, 20_000, true)).toBe(0);
  });
});

describe("Codewars", () => {
  it("длина без пробелов, табов и пустых строк", () => {
    expect(solutionLength("def f(x):\n\treturn  x\n\n")).toBe("deff(x):returnx".length);
  });
  it("короче выше, при равной длине — кто раньше", () => {
    const r = rankSolutions([
      { playerId: "a", code: "return x+1", at: 30 },
      { playerId: "b", code: "return   x + 1", at: 10 },
      { playerId: "c", code: "x+1", at: 50 },
    ]);
    expect(r.map((s) => s.playerId)).toEqual(["c", "b", "a"]);
  });
});

describe("очки Codewars", () => {
  it("за место: 1000, 900, … не меньше 300", () => {
    expect([1, 2, 3, 8, 20].map(codewarsPoints)).toEqual([1000, 900, 800, 300, 300]);
    expect(codewarsPoints(0)).toBe(0);
  });
});

describe("short answer", () => {
  it("регистр и пробелы", () => {
    expect(checkShortAnswer("  Hello ", ["hello"], false)).toBe(true);
    expect(checkShortAnswer("Hello", ["hello"], true)).toBe(false);
    expect(checkShortAnswer("", [""], false)).toBe(false);
  });
});

describe("канат", () => {
  it("двигается и упирается в край", () => {
    expect(pullRope(0, 0)).toBe(-1);
    expect(pullRope(5, 1)).toBe(5);
    expect(ropeWinner(-5)).toBe(0);
    expect(ropeWinner(2, 5, true)).toBe(1);
    expect(ropeWinner(0, 5, true)).toBe(null);
  });
});

describe("команды", () => {
  it("среднее и ровное деление", () => {
    expect(teamAverage([1000, 500])).toBe(750);
    expect(teamAverage([])).toBe(0);
    const t = shuffleIntoTeams([1, 2, 3, 4, 5, 6, 7], 3);
    expect(t.map((x) => x.length).sort()).toEqual([2, 2, 3]);
    expect(t.flat().sort()).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe("задания и протокол", () => {
  it("публичная версия не содержит ответа", () => {
    const t = Task.parse({ type: "choice", topic: "t", prompt: "?", options: ["a", "b"], correct: 1, explanation: "e" });
    const p = toPublicTask(t) as Record<string, unknown>;
    expect(p.correct).toBeUndefined();
    expect(p.explanation).toBeUndefined();
  });
  it("индекс правильного ответа проверяется", () => {
    expect(Task.safeParse({ type: "choice", topic: "t", prompt: "?", options: ["a", "b"], correct: 3 }).success).toBe(false);
  });
  it("пример из ТЗ валиден", () => {
    const r = Task.safeParse({
      type: "code",
      topic: "Списки в Python",
      difficulty: "easy",
      language: "python",
      prompt: "Верни список только чётных чисел из nums.",
      starter: "def evens(nums):\n    pass",
      tests: [{ call: "evens([1, 2, 3, 4])", expected: "[2, 4]" }, { call: "evens([])", expected: "[]" }],
      timeLimitSec: 300,
    });
    expect(r.success).toBe(true);
  });
  it("мусор и короткие имена отбрасываются", () => {
    expect(parseClientMessage("{bad")).toBeNull();
    expect(parseClientMessage({ type: "join", name: " A " })).toBeNull();
    expect(parseClientMessage({ type: "join", name: "  Айбек   К. " })).toEqual({ type: "join", name: "Айбек К." });
  });
});
