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

export const BANK: BankSet[] = Object.entries(modules)
  .flatMap(([path, raw]) => {
    const r = TaskSet.safeParse(raw);
    return r.success ? [{ id: path.replace(/^.*tasks\//, ""), set: r.data }] : [];
  })
  .sort((a, b) => a.id.localeCompare(b.id));

export const bankFor = (game: GameKind) => BANK.filter((b) => b.set.game === game);
