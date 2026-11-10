/**
 * Прогресс ученика по чекпоинту урока: какая доля строк эталона учителя
 * уже есть в файле ученика — в том же порядке (наибольшая общая подпоследовательность).
 * Пробелы, отступы и пустые строки не важны; лишние строки ученика не штрафуются.
 */
export function normalizeLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ""))
    .filter((l) => l.length > 0);
}

/** Длина наибольшей общей подпоследовательности строк (O(n·m) по памяти O(m)). */
function lcs(a: string[], b: string[]): number {
  const prev = new Array<number>(b.length + 1).fill(0);
  const cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j]!;
  }
  return prev[b.length]!;
}

/** Процент 0…100. Пустой эталон — 100 (сравнивать не с чем). */
export function lessonProgress(reference: string, mine: string): number {
  const ref = normalizeLines(reference);
  if (ref.length === 0) return 100;
  const my = normalizeLines(mine).slice(0, 2000);
  return Math.round((lcs(ref.slice(0, 2000), my) / Math.min(ref.length, 2000)) * 100);
}
