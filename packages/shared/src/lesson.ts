/**
 * Прогресс ученика по чекпоинту урока: какая доля эталона учителя (слов и знаков кода)
 * уже есть в файле ученика — в том же порядке (наибольшая общая подпоследовательность).
 * Пробелы, отступы и пустые строки не важны; лишнее у ученика не штрафуется.
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

/**
 * Слова и знаки кода без пробелов: «<li class="a">» → < li class = " a " >.
 * Сравнение по ним даёт частичный процент внутри строки: одна опечатка
 * стоит одного слова, а не всей строки.
 */
export function codeTokens(text: string): string[] {
  return text.match(/[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu) ?? [];
}

/** Больше — считаем по строкам, чтобы не тормозить на огромных файлах. */
const MAX_TOKENS = 5000;

/**
 * Процент 0…100: какая доля эталона учителя уже есть у ученика, в том же порядке.
 * Лишнее у ученика не штрафуется, пробелы и отступы не важны.
 * Пустой эталон — 0: сравнивать не с чем, «готово» никому не ставим.
 */
export function lessonProgress(reference: string, mine: string): number {
  const ref = codeTokens(reference);
  if (ref.length === 0) return 0;
  const my = codeTokens(mine);
  if (ref.length <= MAX_TOKENS && my.length <= MAX_TOKENS) {
    return Math.min(100, Math.floor((lcs(ref, my) / ref.length) * 100));
  }
  const refLines = normalizeLines(reference).slice(0, 2000);
  if (refLines.length === 0) return 0;
  return Math.floor((lcs(refLines, normalizeLines(mine).slice(0, 2000)) / refLines.length) * 100);
}
