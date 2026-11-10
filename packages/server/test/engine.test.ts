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

describe("перетягивание каната", () => {
  const sa = (prompt: string, answers: string[]) => Task.parse({ type: "short_answer", topic: "t", prompt, answers });
  const tugSettings = GameSettings.parse({ roundSec: 180, wrongLockSec: 3 });
  const tugEnv = (now: number) => env(now, ["a", "b", "c"], "teams2"); // a,b — команда 0; c — команда 1

  function tugStarted(): GameData {
    const g = startGame("tug", [sa("5 + 8", ["13"]), sa("len('hi')", ["2"])], tugSettings, 0, "teams2");
    onDeadline(g, tugEnv(COUNTDOWN_MS));
    return g;
  }

  it("нужно ровно 2 команды и задания с коротким ответом", () => {
    expect(() => startGame("tug", [sa("1+1", ["2"])], tugSettings, 0, "teams3")).toThrow(/2 команды/);
    expect(() => startGame("tug", [q(1)], tugSettings, 0, "teams2")).toThrow(GameError);
  });

  it("первый правильный ответ тянет канат и сразу даёт следующее задание", () => {
    const g = tugStarted();
    expect(g.deadline).toBe(COUNTDOWN_MS + 180_000); // общий таймер раунда
    const first = g.taskKey;
    const fx = submit(g, tugEnv(5000), "c", first, " 13 ");
    expect(g.rope).toBe(1); // команда 1 тянет в плюс
    expect(g.lastPull).toMatchObject({ team: 1, name: "Тимур" });
    expect(g.taskKey).not.toBe(first);
    expect(fx.some((e) => e.msg.type === "task")).toBe(true);
    // Опоздавший с ответом на старое задание получает отказ — двух «первых» нет.
    expect(() => submit(g, tugEnv(5001), "a", first, "13")).toThrow(/закончилось/);
  });

  it("ошибка блокирует ввод на 3 секунды", () => {
    const g = tugStarted();
    const fx = submit(g, tugEnv(5000), "a", g.taskKey, "12");
    const r = fx.find((e) => e.msg.type === "result")!.msg as { correct: boolean; lockedUntil: number };
    expect(r).toMatchObject({ correct: false, lockedUntil: 8000 });
    expect(() => submit(g, tugEnv(7000), "a", g.taskKey, "13")).toThrow(/Подожди/);
    submit(g, tugEnv(8000), "a", g.taskKey, "13");
    expect(g.rope).toBe(-1);
  });

  it("канат у края — победа, по времени — у кого перевес", () => {
    const g = tugStarted();
    for (let i = 0; i < 5; i++) submit(g, tugEnv(5000 + i), "a", g.taskKey, g.tasks[g.index]!.type === "short_answer" ? (g.tasks[g.index] as { answers: string[] }).answers[0]! : "");
    expect(g.rope).toBe(-5);
    expect(g.phase).toBe("over");
    expect(g.winner).toBe(0);

    const g2 = tugStarted();
    submit(g2, tugEnv(5000), "c", g2.taskKey, "13");
    onDeadline(g2, tugEnv(COUNTDOWN_MS + 180_000));
    expect(g2.phase).toBe("over");
    expect(g2.winner).toBe(1);
    expect(gameState(g2, tugEnv(0)).teamScores).toEqual([0, 1]);
  });

  it("задания идут по кругу, ученик без команды не тянет", () => {
    const g = tugStarted();
    submit(g, tugEnv(5000), "c", g.taskKey, "13");
    submit(g, tugEnv(5001), "c", g.taskKey, "2");
    expect(g.index).toBe(0); // снова первое задание, но с новым ключом
    const e: EngineEnv = { ...tugEnv(6000), players: [...tugEnv(0).players, { id: "d", name: "Новенький", team: null }] };
    expect(() => submit(g, e, "d", g.taskKey, "13")).toThrow(/команду/);
  });

  it("пауза продлевает блокировку и не ест время раунда", () => {
    const g = tugStarted();
    submit(g, tugEnv(5000), "a", g.taskKey, "0"); // блок до 8000
    pause(g, tugEnv(6000));
    resume(g, tugEnv(66_000)); // минута паузы
    expect(g.locks.a).toBe(68_000);
    expect(g.deadline).toBe(COUNTDOWN_MS + 180_000 + 60_000);
  });
});
