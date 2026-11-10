import { useEffect, useState } from "react";
import confetti from "canvas-confetti";
import type { GameSnapshot, TaskSet } from "@codearena/shared";
import type { Locale } from "./i18n.ts";
import { vscode } from "./vscode.ts";

/** Текущее время, обновляется каждые `ms` — для таймеров. */
export function useNow(ms = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/** Сколько секунд осталось (с паузой). */
export function secondsLeft(g: GameSnapshot, now: number): number {
  if (g.phase === "paused") return (g.pausedLeftMs ?? 0) / 1000;
  if (g.deadline === null) return 0;
  return Math.max(0, (g.deadline - now) / 1000);
}

/* ───────────────────────── Звуки ───────────────────────── */

type Sound = "correct" | "wrong" | "tick" | "win" | "go";
let ctx: AudioContext | null = null;

/** Короткие негромкие звуки, синтезируются на лету — без файлов. */
export function play(sound: Sound): void {
  if (!soundEnabled()) return;
  try {
    ctx ??= new AudioContext();
    const notes: Record<Sound, [number, number, OscillatorType][]> = {
      correct: [[660, 0, "sine"], [990, 0.09, "sine"]],
      wrong: [[220, 0, "square"], [180, 0.1, "square"]],
      tick: [[1200, 0, "sine"]],
      go: [[523, 0, "triangle"], [784, 0.12, "triangle"]],
      win: [[523, 0, "triangle"], [659, 0.12, "triangle"], [784, 0.24, "triangle"], [1047, 0.36, "triangle"]],
    };
    for (const [freq, at, type] of notes[sound]) {
      const t = ctx.currentTime + at;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(sound === "wrong" ? 0.04 : 0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (sound === "tick" ? 0.05 : 0.18));
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.2);
    }
  } catch {
    /* звук — не главное */
  }
}

interface UiState {
  sound?: boolean;
  draft?: TaskSet;
  draftTug?: TaskSet;
  questionSec?: number;
  roundSec?: number;
  wrongLockSec?: number;
}

const readState = (): UiState => vscode.getState<UiState>() ?? {};
export const writeState = (patch: Partial<UiState>) => vscode.setState({ ...readState(), ...patch });
export const readUiState = readState;

let soundDefault = false;
/** По умолчанию звук у учеников выключен (класс шумный), у учителя включён. */
export function setSoundDefault(on: boolean): void {
  soundDefault = on;
}
export function soundEnabled(): boolean {
  return readState().sound ?? soundDefault;
}

/* ───────────────────────── Конфетти ───────────────────────── */

export function celebrate(): void {
  const colors = ["#8B5CF6", "#F43F5E", "#3B82F6", "#F59E0B", "#10B981"];
  const opts = { colors, disableForReducedMotion: true, ticks: 220 };
  void confetti({ ...opts, particleCount: 90, spread: 75, origin: { y: 0.65 } });
  setTimeout(() => void confetti({ ...opts, particleCount: 60, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } }), 220);
  setTimeout(() => void confetti({ ...opts, particleCount: 60, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } }), 220);
}

/* ───────────────────────── Пример викторины ───────────────────────── */

export function sampleQuiz(locale: Locale): TaskSet {
  const ru = locale === "ru";
  const q = (prompt: string, options: string[], correct: number, explanation: string) => ({
    type: "choice" as const,
    topic: ru ? "Основы Python" : "Python basics",
    difficulty: "easy" as const,
    timeLimitSec: 20,
    prompt,
    options,
    correct,
    explanation,
  });
  return {
    version: 1,
    title: ru ? "Основы Python" : "Python basics",
    tasks: ru
      ? [
          q("Что выведет print(len('hello'))?", ["4", "5", "6", "hello"], 1, "len() считает символы: h-e-l-l-o — это 5."),
          q("Какой тип у значения 3.0?", ["int", "float", "str", "bool"], 1, "Число с точкой — это float, даже если дробная часть равна нулю."),
          q("Чем начинается комментарий в Python?", ["//", "#", "<!--", "--"], 1, "В Python комментарий начинается с #."),
          q("Что выведет print(2 ** 3)?", ["6", "8", "9", "23"], 1, "** — возведение в степень: 2 × 2 × 2 = 8."),
          q("Какой индекс у первого элемента списка?", ["0", "1", "-1"], 0, "Индексы в Python начинаются с нуля."),
        ]
      : [
          q("What does print(len('hello')) output?", ["4", "5", "6", "hello"], 1, "len() counts characters: h-e-l-l-o is 5."),
          q("What is the type of 3.0?", ["int", "float", "str", "bool"], 1, "A number with a dot is a float, even if the fraction is zero."),
          q("How does a comment start in Python?", ["//", "#", "<!--", "--"], 1, "Python comments start with #."),
          q("What does print(2 ** 3) output?", ["6", "8", "9", "23"], 1, "** is exponentiation: 2 × 2 × 2 = 8."),
          q("What is the index of the first list element?", ["0", "1", "-1"], 0, "Python indexes start at zero."),
        ],
  };
}

/* ───────────────────────── Пример для каната ───────────────────────── */

export function sampleTug(locale: Locale): TaskSet {
  const ru = locale === "ru";
  const s = (prompt: string, ...answers: string[]) => ({
    type: "short_answer" as const,
    topic: ru ? "Разминка" : "Warm-up",
    difficulty: "easy" as const,
    timeLimitSec: 60,
    prompt,
    answers,
    caseSensitive: false,
  });
  return {
    version: 1,
    title: ru ? "Разминка: числа и Python" : "Warm-up: numbers and Python",
    tasks: [
      s("5 + 8", "13"),
      s("print(len('hello'))", "5"),
      s("7 × 6", "42"),
      s("print(10 // 3)", "3"),
      s("print(2 ** 4)", "16"),
      s("print('ab' * 3)", "ababab"),
      s("100 − 37", "63"),
      s("print(10 % 4)", "2"),
      s("print(type(3.0).__name__)", "float"),
      s("print(len([1, 2, 3, 4]))", "4"),
      s("9 × 9", "81"),
      s("print('Python'[0])", "P"),
      s("print(max(3, 8, 5))", "8"),
      s("print(sum([1, 2, 3]))", "6"),
      s("144 ÷ 12", "12"),
      s("print(bool(0))", "False"),
    ],
  };
}
