import { Fragment } from "react";
import { cn } from "../lib/cn.ts";

/**
 * Лёгкая подсветка Python/JavaScript без библиотек: ключевые слова, строки,
 * числа, комментарии. Цвета берутся из темы VS Code, если она их задаёт.
 */
const KEYWORDS: Record<string, Set<string>> = {
  python: new Set("def return if elif else for while in not and or is None True False lambda import from as class pass break continue try except finally with yield print len range".split(" ")),
  javascript: new Set("function return if else for while of in const let var new class this null undefined true false typeof instanceof break continue try catch finally switch case default async await console".split(" ")),
};

type Tok = { t: "kw" | "str" | "num" | "com" | "txt"; v: string };

function tokenize(code: string, lang: string): Tok[] {
  const kw = KEYWORDS[lang] ?? KEYWORDS.javascript!;
  const comment = lang === "python" ? /#.*/y : /\/\/.*|\/\*[\s\S]*?\*\//y;
  const re = {
    str: /("""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)/y,
    num: /\b\d+(?:\.\d+)?\b/y,
    word: /[A-Za-z_$][\w$]*/y,
  };
  const out: Tok[] = [];
  let i = 0;
  const push = (t: Tok["t"], v: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t && t === "txt") last.v += v;
    else out.push({ t, v });
  };
  while (i < code.length) {
    let m: RegExpExecArray | null;
    comment.lastIndex = i;
    if ((m = comment.exec(code))) { push("com", m[0]); i += m[0].length; continue; }
    re.str.lastIndex = i;
    if ((m = re.str.exec(code))) { push("str", m[0]); i += m[0].length; continue; }
    re.num.lastIndex = i;
    if ((m = re.num.exec(code))) { push("num", m[0]); i += m[0].length; continue; }
    re.word.lastIndex = i;
    if ((m = re.word.exec(code))) { push(kw.has(m[0]) ? "kw" : "txt", m[0]); i += m[0].length; continue; }
    push("txt", code[i]!);
    i += 1;
  }
  return out;
}

const COLOR: Record<Tok["t"], string | undefined> = {
  kw: "var(--vscode-symbolIcon-keywordForeground, #c586c0)",
  str: "var(--vscode-debugTokenExpression-string, #ce9178)",
  num: "var(--vscode-debugTokenExpression-number, #b5cea8)",
  com: "var(--vscode-descriptionForeground, #6a9955)",
  txt: undefined,
};

export function CodeBlock({ code, lang, className, lineNumbers }: { code: string; lang: string; className?: string; lineNumbers?: boolean }) {
  const toks = tokenize(code.replace(/\s+$/, ""), lang);
  const body = toks.map((tk, i) => (
    <span key={i} style={COLOR[tk.t] ? { color: COLOR[tk.t], fontStyle: tk.t === "com" ? "italic" : undefined } : undefined}>
      {tk.v}
    </span>
  ));
  const lines = code.replace(/\s+$/, "").split("\n").length;
  return (
    <pre
      className={cn(
        "overflow-x-auto rounded-[10px] border border-border bg-[var(--vscode-textCodeBlock-background,var(--ca-surface-2))] p-3 font-mono text-[13px] leading-[1.55]",
        className,
      )}
    >
      {lineNumbers ? (
        <div className="grid grid-cols-[auto_1fr] gap-x-3">
          <span className="select-none text-right text-muted/60">
            {Array.from({ length: lines }, (_, i) => (
              <Fragment key={i}>
                {i + 1}
                {"\n"}
              </Fragment>
            ))}
          </span>
          <code>{body}</code>
        </div>
      ) : (
        <code>{body}</code>
      )}
    </pre>
  );
}
