/** Склейка классов без лишних зависимостей. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Инициалы для аватарки: «Айбек Касымов» → «АК», «Нурай» → «НУ». */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[1]![0]!).toUpperCase();
  return (words[0] ?? "?").slice(0, 2).toUpperCase();
}
