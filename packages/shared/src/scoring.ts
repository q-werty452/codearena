/**
 * Ядро логики очков. Чистые функции, без состояния — покрыты тестами.
 */

/** Очки викторины: 1000 × (1 − время/лимит/2), то есть от 500 до 1000. */
export function quizPoints(answerMs: number, limitMs: number, correct: boolean): number {
  if (!correct || limitMs <= 0 || answerMs > limitMs) return 0;
  const t = Math.max(0, answerMs);
  return Math.round(1000 * (1 - t / limitMs / 2));
}

/** Длина решения для Codewars: без пробелов, табов и переводов строк. */
export function solutionLength(code: string): number {
  return code.replace(/\s+/g, "").length;
}

export interface Solution {
  playerId: string;
  code: string;
  /** Unix ms отправки (время сервера). */
  at: number;
}

/** Сортировка правильных решений: короче выше, при равной длине — кто раньше. */
export function rankSolutions<T extends Solution>(list: readonly T[]): (T & { length: number })[] {
  return list
    .map((s) => ({ ...s, length: solutionLength(s.code) }))
    .sort((a, b) => a.length - b.length || a.at - b.at);
}

/** Сравнение короткого ответа с допустимыми вариантами. */
export function checkShortAnswer(given: string, answers: readonly string[], caseSensitive: boolean): boolean {
  const norm = (s: string) => {
    const t = s.trim().replace(/\s+/g, " ");
    return caseSensitive ? t : t.toLowerCase();
  };
  const g = norm(given);
  return g.length > 0 && answers.some((a) => norm(a) === g);
}

/** Канат: шаг к команде (0 тянет в −, 1 тянет в +). Возвращает новую позицию в [−limit, +limit]. */
export function pullRope(position: number, team: 0 | 1, limit = 5): number {
  const next = position + (team === 0 ? -1 : 1);
  return Math.max(-limit, Math.min(limit, next));
}

/** Победитель каната или null (ничья / ещё идёт). */
export function ropeWinner(position: number, limit = 5, timeUp = false): 0 | 1 | null {
  if (position <= -limit) return 0;
  if (position >= limit) return 1;
  if (timeUp && position !== 0) return position < 0 ? 0 : 1;
  return null;
}

/** Очки команды в викторине — среднее по участникам (чтобы большая команда не выигрывала числом). */
export function teamAverage(scores: readonly number[]): number {
  if (scores.length === 0) return 0;
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

/** Случайное распределение по командам, максимально ровное. */
export function shuffleIntoTeams<T>(items: readonly T[], teams: number, rnd: () => number = Math.random): T[][] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  const out: T[][] = Array.from({ length: teams }, () => []);
  a.forEach((x, i) => out[i % teams]!.push(x));
  return out;
}
