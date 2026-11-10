import { useSyncExternalStore } from "react";
import { distribute, fitsGame, type AiState, type GameKind, type HostToUi, type ImportResult, type MySet, type Task } from "@codearena/shared";
import { onHostMessage } from "./vscode.ts";

/**
 * «Мои задания» и ИИ-помощник: состояние приходит от расширения
 * (my_tasks, ai_state, import_result). Подписка — при загрузке модуля,
 * чтобы не потерять сообщения до монтирования компонентов.
 */
interface State {
  sets: MySet[];
  ai: AiState;
  /** Последний итог загрузки/генерации — показывается в окне «Задания разложены». */
  result: { id: number; result: ImportResult } | null;
}

let state: State = { sets: [], ai: { hasKey: false, busy: false }, result: null };
const listeners = new Set<() => void>();
const set = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
let resultId = 0;

onHostMessage<HostToUi>((m) => {
  if (m.type === "my_tasks") set({ sets: m.sets });
  if (m.type === "ai_state") set({ ai: m.state });
  if (m.type === "import_result") set({ result: { id: ++resultId, result: m.result } });
});

export function useMyTasks(): State {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
}

export const clearImportResult = () => set({ result: null });
/** Показать итог, разобранный прямо в webview (вставленный текст). */
export const showImportResult = (result: ImportResult) => set({ result: { id: ++resultId, result } });

/** Задания набора, подходящие игре (гонка берёт викторину, канат и Codewars). */
export function tasksFor(s: MySet, game: GameKind): Task[] {
  return s.tasks.filter((t) => fitsGame(game, t));
}

/** Сколько заданий набора в каждой игре — для подписи «Викторина 8 · Канат 4». */
export function countsByGame(tasks: Task[]): Partial<Record<GameKind, number>> {
  return Object.fromEntries(Object.entries(distribute(tasks)).map(([g, ts]) => [g, ts!.length]));
}

/** Добавить к черновику без повторов (тот же тип и текст задания). */
export function mergeTasks(draft: Task[], add: Task[]): Task[] {
  const key = (t: Task) => `${t.type}\u0000${t.prompt}\u0000${"code" in t ? t.code : ""}`;
  const seen = new Set(draft.map(key));
  return [...draft, ...add.filter((t) => !seen.has(key(t)) && seen.add(key(t)))];
}
