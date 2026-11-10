/** Игровые цвета из ТЗ: одинаковые в светлой и тёмной теме. */
export const COLORS = {
  team: ["#F43F5E", "#3B82F6", "#10B981"] as const,
  option: ["#F43F5E", "#3B82F6", "#F59E0B", "#10B981"] as const,
  accent: "#8B5CF6",
  success: "#22C55E",
  error: "#EF4444",
  warning: "#F59E0B",
} as const;

/** Фигуры вариантов ответа (не только цвет — для дальтоников и проектора). */
export const OPTION_SHAPES = ["triangle", "diamond", "circle", "square"] as const;
export type OptionShape = (typeof OPTION_SHAPES)[number];

/** Иконки команд (lucide), чтобы команды отличались не только цветом. */
export const TEAM_ICONS = ["flame", "droplet", "leaf"] as const;

export const DEFAULT_TEAM_NAMES = {
  ru: ["Красные", "Синие", "Зелёные"],
  ky: ["Кызылдар", "Көктөр", "Жашылдар"],
  en: ["Red", "Blue", "Green"],
} as const;

/** Константы игры. */
export const LIMITS = {
  ropeLimit: 5,
  codeTimeoutMs: 5000,
  roomIdleMs: 6 * 60 * 60 * 1000,
  maxPlayers: 60,
} as const;
