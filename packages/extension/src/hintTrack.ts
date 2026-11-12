/**
 * Подсказка учителя привязана к строке ученика вместе с её текстом (anchor).
 * Ученик правит файл — строки сдвигаются: ищем тот же текст поблизости.
 * Если саму строку изменили — подсказка выполнена и пропадает.
 */
export interface TrackedHint {
  /** Номер строки с 0. */
  line: number;
  /** Текст строки в момент подсказки. */
  anchor: string;
  text: string;
}

const NEAR = 60;

export function relocateHints(hints: TrackedHint[], lines: string[]): TrackedHint[] {
  const out: TrackedHint[] = [];
  for (const h of hints) {
    if (lines[h.line] === h.anchor) {
      out.push(h);
      continue;
    }
    let found = -1;
    for (let d = 1; d <= NEAR && found < 0; d++) {
      if (lines[h.line - d] === h.anchor) found = h.line - d;
      else if (lines[h.line + d] === h.anchor) found = h.line + d;
    }
    if (found >= 0) out.push({ ...h, line: found });
  }
  return out;
}
