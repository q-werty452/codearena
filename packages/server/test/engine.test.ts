import { describe, expect, it } from "vitest";
import { GameSettings, Task } from "@codearena/shared";
import {
  COUNTDOWN_MS,
  GameError,
  finish,
  gameState,
  next,
  onDeadline,
  pause,
  resume,
  resumeFor,
  startGame,
  submit,
  type EngineEnv,
  type GameData,
} from "../src/engine.ts";

const settings = GameSettings.parse({ questionSec: 20 });
const q = (correct: number) =>
  Task.parse({ type: "choice", topic: "t", prompt: "2+2?", options: ["3", "4", "5", "22"], correct, explanation: "потому что" });

function env(now: number, online = ["a", "b", "c"], mode: EngineEnv["mode"] = "solo"): EngineEnv {
  return {
    now,
    online: new Set(online),
    mode,
    players: [
      { id: "a", name: "Айбек", team: 0 },
      { id: "b", name: "Нурай", team: 0 },
      { id: "c", name: "Тимур", team: 1 },
    ],
  };
}

/** Игра на первом вопросе в момент t=10_000. */
function atFirstQuestion(): GameData {
  const g = startGame("quiz", [q(1), q(2)], settings, 0);
  onDeadline(g, env(COUNTDOWN_MS));
  return g;
}

describe("викторина: ход игры", () => {
  it("отсчёт → вопрос → таймер → показ ответа", () => {
    const g = startGame("quiz", [q(1)], settings, 0);
    expect(g.phase).toBe("countdown");
    expect(onDeadline(g, env(1000))).toEqual([]); // рано
    const fx = onDeadline(g, env(COUNTDOWN_MS));
    expect(g.phase).toBe("playing");
    const task = fx.find((e) => e.msg.type === "task")!.msg as { task: Record<string, unknown> };
    expect(task.task.correct).toBeUndefined(); // ответ не утекает
    expect(task.task.explanation).toBeUndefined();

    onDeadline(g, env(COUNTDOWN_MS + 20_000));
    expect(g.phase).toBe("reveal");
  });

  it("очки за скорость и досрочный показ, когда ответили все", () => {
    const g = atFirstQuestion();
    const t0 = COUNTDOWN_MS;
    submit(g, env(t0), "a", "t0", 1); // мгновенно, верно → 1000
    submit(g, env(t0 + 10_000), "b", "t0", 1); // половина времени → 750
    expect(g.phase).toBe("playing");
    const fx = submit(g, env(t0 + 12_000), "c", "t0", 0); // неверно → 0, все ответили
    expect(g.phase).toBe("reveal");
    expect(g.scores).toEqual({ a: 1000, b: 750, c: 0 });

    const reveal = fx.find((e) => e.msg.type === "reveal")!.msg as { stats: number[]; answer: number };
    expect(reveal.answer).toBe(1);
    expect(reveal.stats).toEqual([1, 2, 0, 0]);
    // Каждому игроку — свой результат.
    expect(fx.filter((e) => e.msg.type === "result")).toHaveLength(3);
  });

  it("повторный ответ, чужое задание и ответ после времени отклоняются", () => {
    const g = atFirstQuestion();
    submit(g, env(4000), "a", "t0", 1);
    expect(() => submit(g, env(4100), "a", "t0", 2)).toThrow(GameError);
    expect(() => submit(g, env(4100), "b", "t1", 2)).toThrow(/закончилось/);
    expect(() => submit(g, env(COUNTDOWN_MS + 20_001), "b", "t0", 1)).toThrow(/Время/);
    expect(() => submit(g, env(4100), "b", "t0", 9)).toThrow(GameError);
  });

  it("пауза не отнимает очки и не тратит время", () => {
    const g = atFirstQuestion();
    pause(g, env(COUNTDOWN_MS + 5_000)); // прошло 5 с
    expect(g.phase).toBe("paused");
    expect(gameState(g, env(0)).pausedLeftMs).toBe(15_000);
    resume(g, env(COUNTDOWN_MS + 65_000)); // минута паузы
    expect(g.deadline).toBe(COUNTDOWN_MS + 80_000);
    submit(g, env(COUNTDOWN_MS + 65_000), "a", "t0", 1);
    // Для игрока прошло 5 с из 20 → 1000 × (1 − 5/20/2) = 875
    expect(g.scores.a ?? g.answers.t0!.a!.points).toBe(875);
  });

  it("«Дальше» после последнего вопроса завершает игру", () => {
    const g = atFirstQuestion();
    next(g, env(5000)); // досрочный показ
    expect(g.phase).toBe("reveal");
    next(g, env(6000));
    expect(g.index).toBe(1);
    next(g, env(7000));
    const fx = next(g, env(8000));
    expect(g.phase).toBe("over");
    expect(fx[0]!.msg.type).toBe("game_over");
  });

  it("завершение посреди вопроса засчитывает уже данные ответы", () => {
    const g = atFirstQuestion();
    submit(g, env(COUNTDOWN_MS), "a", "t0", 1);
    finish(g, env(COUNTDOWN_MS + 1000));
    expect(g.scores.a).toBe(1000);
  });

  it("очки команды — среднее по участникам", () => {
    const g = atFirstQuestion();
    submit(g, env(COUNTDOWN_MS, ["a", "b", "c"], "teams2"), "a", "t0", 1); // 1000
    submit(g, env(COUNTDOWN_MS, ["a", "b", "c"], "teams2"), "b", "t0", 0); // 0
    submit(g, env(COUNTDOWN_MS, ["a", "b", "c"], "teams2"), "c", "t0", 1); // 1000
    const s = gameState(g, env(9000, ["a", "b", "c"], "teams2"));
    expect(s.teamScores).toEqual([500, 1000]);
    expect(s.leaders.map((l) => l.id)).toEqual(["a", "c", "b"]);
  });

  it("переподключение возвращает задание и «ответ принят»", () => {
    const g = atFirstQuestion();
    submit(g, env(4000), "a", "t0", 1);
    const msgs = resumeFor(g, env(5000), "a").map((m) => m.type);
    expect(msgs).toEqual(["game_started", "task", "answered", "state"]);
  });

  it("в викторине только вопросы с вариантами", () => {
    const bad = Task.parse({ type: "short_answer", topic: "t", prompt: "?", answers: ["4"] });
    expect(() => startGame("quiz", [bad], settings, 0)).toThrow(GameError);
    expect(() => startGame("quiz", [], settings, 0)).toThrow(GameError);
  });
});
