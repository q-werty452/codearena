/** Файл задачи Codewars: шапка с условием и тестами, разделитель, заготовка. Без зависимости от vscode. */
import type { GameSnapshot } from "@codearena/shared";

export type CodeTask = Extract<NonNullable<GameSnapshot["task"]>, { type: "code" }>;

/** Строка-разделитель: всё, что ниже, — решение ученика. */
export const MARKER = "─── CodeArena ───";

export function fileExtension(lang: CodeTask["language"]): string {
  return lang === "python" ? "py" : lang === "javascript" ? "js" : lang;
}

function wrap(text: string, width = 76): string[] {
  return text.split("\n").flatMap((line) => {
    const out: string[] = [];
    let rest = line;
    while (rest.length > width) {
      const space = rest.lastIndexOf(" ", width);
      const cut = space > 20 ? space : width;
      out.push(rest.slice(0, cut));
      rest = rest.slice(cut).trimStart();
    }
    out.push(rest);
    return out;
  });
}

export function taskFileContent(task: CodeTask, index: number, ru: boolean): string {
  const c = task.language === "python" ? "#" : "//";
  return [
    `${c} CodeArena · ${ru ? "Задача" : "Task"} ${index + 1}`,
    `${c}`,
    ...wrap(task.prompt).map((l) => `${c} ${l}`),
    `${c}`,
    `${c} ${ru ? "Тесты:" : "Tests:"}`,
    ...task.tests.map((t) => `${c}   ${t.call}  →  ${t.expected}`),
    `${c} ${MARKER} ${ru ? "пиши решение ниже" : "write your solution below"}`,
    "",
    task.starter,
    "",
  ].join("\n");
}

/** Решение ученика — всё, что ниже разделителя (шапка не считается в длину и не выполняется). */
export function extractSolution(text: string): string {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(MARKER));
  return (i >= 0 ? lines.slice(i + 1) : lines).join("\n").replace(/^\s*\n/, "").trimEnd() + "\n";
}
