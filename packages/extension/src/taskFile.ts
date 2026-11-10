/**
 * Файл задачи с кодом (Codewars, «Исправь баг»): шапка-комментарий с условием
 * и проверками, разделитель, ниже — заготовка или сломанный код.
 * Без зависимости от vscode.
 */
import type { GameSnapshot, Language } from "@codearena/shared";

type AnyTask = NonNullable<GameSnapshot["task"]>;
export type CodeTask = Extract<AnyTask, { type: "code" }>;
export type FixTask = Extract<AnyTask, { type: "fix_bug" }>;
export type FileTask = CodeTask | FixTask;

/** Строка-разделитель: всё, что ниже, — решение ученика. */
export const MARKER = "─── CodeArena ───";

export function fileExtension(lang: Language): string {
  return { html: "html", css: "css", javascript: "js", python: "py", dart: "dart" }[lang];
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

/** Как оформить многострочный комментарий в каждом языке. */
function commentStyle(lang: Language): { first: string; line: string; last: (s: string) => string } {
  if (lang === "html") return { first: "<!--", line: "    ", last: (s) => `${s} -->` };
  if (lang === "css") return { first: "/*", line: " * ", last: (s) => `${s} */` };
  const c = lang === "python" ? "#" : "//";
  return { first: c, line: `${c} `, last: (s) => s };
}

export function taskFileContent(task: FileTask, index: number, ru: boolean): string {
  const st = commentStyle(task.language);
  const title = task.type === "fix_bug" ? (ru ? "Исправь баг" : "Fix the bug") : ru ? "Задача" : "Task";
  const checks =
    task.language === "html" || task.language === "css"
      ? task.rules.map((r) => `  • ${r.label}`)
      : task.tests.map((t) => `  ${t.call}  →  ${t.expected}`);
  const header = [
    `${st.first} CodeArena · ${title} ${index + 1}`,
    st.line.trimEnd(),
    ...wrap(task.prompt).map((l) => `${st.line}${l}`),
    st.line.trimEnd(),
    `${st.line}${ru ? "Проверки:" : "Checks:"}`,
    ...checks.map((l) => `${st.line}${l}`),
    st.last(`${st.line}${MARKER} ${ru ? "пиши решение ниже" : "write your solution below"}`),
  ];
  const body = task.type === "fix_bug" ? task.code : task.starter;
  return [...header, "", body, ""].join("\n");
}

/** Решение ученика — всё, что ниже разделителя (шапка не считается в длину и не проверяется). */
export function extractSolution(text: string): string {
  const lines = text.split(/\r?\n/);
  const i = lines.findIndex((l) => l.includes(MARKER));
  return (i >= 0 ? lines.slice(i + 1) : lines).join("\n").replace(/^\s*\n/, "").trimEnd() + "\n";
}
