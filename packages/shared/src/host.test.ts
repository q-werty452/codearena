import { describe, expect, it, vi } from "vitest";
import { GameSettings } from "./protocol.ts";
import { applyGameMessage, type GameSnapshot } from "./host.ts";

const settings = GameSettings.parse({});
const state = (over: Record<string, unknown> = {}) => ({
  type: "state" as const,
  state: { game: "quiz" as const, phase: "playing" as const, taskIndex: 0, taskCount: 3, deadline: 50_000, rope: 0, teamScores: [], leaders: [], answered: 1, total: 5, pausedLeftMs: null, serverNow: 40_000, ...over },
});

describe("applyGameMessage", () => {
  it("переводит дедлайн сервера на локальные часы", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000); // мои часы отстают от сервера на 30 с
    const clock = { offset: 0 };
    let g = applyGameMessage(null, { type: "game_started", game: "quiz", settings }, clock) as GameSnapshot;
    g = applyGameMessage(g, state(), clock) as GameSnapshot;
    expect(clock.offset).toBe(30_000);
    expect(g.deadline).toBe(20_000); // 50 000 по серверу = 20 000 по моим часам
    g = applyGameMessage(g, { type: "task", taskId: "t1", index: 1, task: { type: "choice", prompt: "?", options: ["a", "b"] }, deadline: 60_000, limitMs: 20_000 }, clock) as GameSnapshot;
    expect(g.deadline).toBe(30_000);
    vi.useRealTimers();
  });

  it("новое задание сбрасывает мой ответ и показ", () => {
    const clock = { offset: 0 };
    let g = applyGameMessage(null, { type: "game_started", game: "quiz", settings }, clock) as GameSnapshot;
    g = applyGameMessage(g, { type: "task", taskId: "t0", index: 0, task: { type: "choice", prompt: "?", options: ["a", "b"] }, deadline: null, limitMs: null }, clock) as GameSnapshot;
    g = applyGameMessage(g, { type: "answered", taskId: "t0", answer: 1 }, clock) as GameSnapshot;
    expect(g.myAnswer).toBe(1);
    // Подтверждение для чужого задания игнорируется.
    expect((applyGameMessage(g, { type: "answered", taskId: "zzz", answer: 0 }, clock) as GameSnapshot).myAnswer).toBe(1);
    g = applyGameMessage(g, { type: "reveal", taskId: "t0", answer: 1, stats: [0, 1] }, clock) as GameSnapshot;
    g = applyGameMessage(g, { type: "result", taskId: "t0", correct: true, points: 900, lockedUntil: null, place: null }, clock) as GameSnapshot;
    expect(g.result).toEqual({ correct: true, points: 900 });
    g = applyGameMessage(g, { type: "task", taskId: "t1", index: 1, task: { type: "choice", prompt: "?", options: ["a", "b"] }, deadline: null, limitMs: null }, clock) as GameSnapshot;
    expect([g.myAnswer, g.reveal, g.result]).toEqual([null, null, null]);
  });

  it("game_reset возвращает в лобби, не игровые сообщения не трогает", () => {
    const clock = { offset: 0 };
    const g = applyGameMessage(null, { type: "game_started", game: "quiz", settings }, clock) as GameSnapshot;
    expect(applyGameMessage(g, { type: "game_reset" }, clock)).toBeNull();
    expect(applyGameMessage(g, { type: "pong", t: 1 }, clock)).toBeUndefined();
  });
});
