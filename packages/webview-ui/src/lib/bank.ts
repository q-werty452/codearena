/**
 * Банк задач: JSON-наборы из папки tasks/ встраиваются в сборку,
 * поэтому работают без интернета. Новые наборы присылают пулл-реквестом.
 */
import { TaskSet, type GameKind } from "@codearena/shared";

const modules = import.meta.glob("../../../../tasks/**/*.json", { eager: true, import: "default" });

export interface BankSet {
  id: string;
  set: TaskSet;
}

const levelKey = (id: string) => id.replace(/\.json$/, "").replace(/-medium$/, "~1").replace(/-hard$/, "~2");

export const BANK: BankSet[] = Object.entries(modules)
  .flatMap(([path, raw]) => {
    const r = TaskSet.safeParse(raw);
    return r.success ? [{ id: path.replace(/^.*tasks\//, ""), set: r.data }] : [];
  })
  // Уровни по порядку: «quiz.json» (базовый) → «quiz-medium.json» → «quiz-hard.json».
  .sort((a, b) => levelKey(a.id).localeCompare(levelKey(b.id)));

/** Наборы для игры. Гонка берёт задания из викторины, каната и Codewars. */
export const bankFor = (game: GameKind) => {
  const games: GameKind[] = game === "race" ? ["quiz", "tug", "codewars"] : [game];
  return BANK.filter((b) => b.set.game !== undefined && games.includes(b.set.game));
};
