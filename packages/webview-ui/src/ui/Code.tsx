import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { cn } from "../lib/cn.ts";

/**
 * Лёгкая подсветка без библиотек: HTML, CSS, JavaScript, Python, Dart.
 * Цвета берутся из темы VS Code, если она их задаёт.
 */
type Kind = "kw" | "str" | "num" | "com" | "tag" | "attr" | "prop" | "sel" | "txt";
type Tok = { t: Kind; v: string };

const KEYWORDS: Record<string, Set<string>> = {
  python: new Set("def return if elif else for while in not and or is None True False lambda import from as class pass break continue try except finally with yield print len range self".split(" ")),
  javascript: new Set("function return if else for while of in const let var new class this null undefined true false typeof instanceof break continue try catch finally switch case default async await console document".split(" ")),
  dart: new Set("class extends with implements return if else for while in final const var new this null true false void async await import static override required super Widget build BuildContext StatelessWidget StatefulWidget setState late".split(" ")),
};

function lex(code: string, rules: [Kind | ((m: string) => Kind), RegExp][]): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const push = (t: Kind, v: string) => {
    const last = out[out.length - 1];
    if (last && last.t === t && t === "txt") last.v += v;
    else out.push({ t, v });
  };
  outer: while (i < code.length) {
    for (const [kind, re] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        push(typeof kind === "function" ? kind(m[0]) : kind, m[0]);
        i += m[0].length;
        continue outer;
      }
    }
    push("txt", code[i]!);
    i += 1;
  }
  return out;
}

function tokenize(code: string, lang: string): Tok[] {
  if (lang === "html") {
    // Теги с атрибутами разбираются отдельно, чтобы подсветить имя, атрибуты и значения.
    const out: Tok[] = [];
    for (const part of code.split(/(<!--[\s\S]*?-->|<\/?[A-Za-z][^>]*>)/g)) {
      if (!part) continue;
      if (part.startsWith("<!--")) out.push({ t: "com", v: part });
      else if (/^<\/?[A-Za-z]/.test(part)) out.push(...lex(part, [["tag", /<\/?[A-Za-z][\w-]*|\/?>/y], ["str", /"[^"]*"|'[^']*'/y], ["attr", /[A-Za-z_:][\w:.-]*/y]]));
      else out.push({ t: "txt", v: part });
    }
    return out;
  }
  if (lang === "css") {
    return lex(code, [
      ["com", /\/\*[\s\S]*?\*\//y],
      ["str", /"[^"\n]*"|'[^'\n]*'/y],
      ["prop", /[a-z-]+(?=\s*:(?![:\w-]*\s*[{,]))/y],
      ["num", /#[0-9a-fA-F]{3,8}\b|-?\d*\.?\d+(?:px|rem|em|%|vh|vw|s|ms|fr|deg)?\b/y],
      ["sel", /[.#]?[A-Za-z_][\w-]*(?=[^{};]*\{)|@[a-z-]+/y],
    ]);
  }
  const kw = KEYWORDS[lang] ?? KEYWORDS.javascript!;
  return lex(code, [
    ["com", lang === "python" ? /#.*/y : /\/\/.*|\/\*[\s\S]*?\*\//y],
    ["str", /"""[\s\S]*?"""|'''[\s\S]*?'''|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y],
    ["num", /\b\d+(?:\.\d+)?\b/y],
    [(w) => (kw.has(w) ? "kw" : "txt"), /[A-Za-z_$][\w$]*/y],
  ]);
}

/** Токены, разбитые по строкам (многострочные комментарии и строки не ломаются). */
function lines(code: string, lang: string): Tok[][] {
  const result: Tok[][] = [[]];
  for (const tk of tokenize(code.replace(/\s+$/, ""), lang)) {
    const parts = tk.v.split("\n");
    parts.forEach((p, i) => {
      if (i > 0) result.push([]);
      if (p) result[result.length - 1]!.push({ t: tk.t, v: p });
    });
  }
  return result;
}

const COLOR: Record<Kind, string | undefined> = {
  kw: "var(--vscode-symbolIcon-keywordForeground, #c586c0)",
  str: "var(--vscode-debugTokenExpression-string, #ce9178)",
  num: "var(--vscode-debugTokenExpression-number, #b5cea8)",
  com: "var(--vscode-descriptionForeground, #6a9955)",
  tag: "var(--vscode-symbolIcon-classForeground, #569cd6)",
  attr: "var(--vscode-symbolIcon-propertyForeground, #9cdcfe)",
  prop: "var(--vscode-symbolIcon-propertyForeground, #9cdcfe)",
  sel: "var(--vscode-symbolIcon-classForeground, #d7ba7d)",
  txt: undefined,
};

function Line({ toks }: { toks: Tok[] }) {
  if (toks.length === 0) return <>{" "}</>;
  return (
    <>
      {toks.map((tk, i) => (
        <span key={i} style={COLOR[tk.t] ? { color: COLOR[tk.t], fontStyle: tk.t === "com" ? "italic" : undefined } : undefined}>
          {tk.v}
        </span>
      ))}
    </>
  );
}

const box = "rounded-[10px] border border-border bg-[var(--vscode-textCodeBlock-background,var(--ca-surface-2))] font-mono text-[13px] leading-[1.6]";

export function CodeBlock({ code, lang, className, lineNumbers }: { code: string; lang: string; className?: string; lineNumbers?: boolean }) {
  const ls = lines(code, lang);
  return (
    <pre className={cn("overflow-x-auto p-3", box, className)}>
      <code className={lineNumbers ? "grid grid-cols-[auto_1fr] gap-x-3" : "block"}>
        {ls.map((toks, i) =>
          lineNumbers ? (
            <span key={i} className="contents">
              <span className="select-none text-right text-muted/60">{i + 1}</span>
              <span className="whitespace-pre">
                <Line toks={toks} />
              </span>
            </span>
          ) : (
            <span key={i} className="block whitespace-pre">
              <Line toks={toks} />
            </span>
          ),
        )}
      </code>
    </pre>
  );
}

/**
 * Код с кликабельными строками («Найди строку»). picked — выбранная строка,
 * correct — правильная (после показа), stats — сколько человек выбрали каждую строку.
 */
export function ClickableCode({
  code,
  lang,
  onPick,
  picked,
  correct,
  stats,
  marked,
}: {
  code: string;
  lang: string;
  onPick?: (line: number) => void;
  picked?: number | null;
  correct?: number | null;
  stats?: number[];
  /** Учитель в редакторе: отмеченная строка с ошибкой. */
  marked?: number | null;
}) {
  const ls = lines(code, lang);
  const revealed = correct !== undefined && correct !== null;
  return (
    <div className={cn("overflow-x-auto py-1.5", box)} role="listbox">
      {ls.map((toks, i) => {
        const n = i + 1;
        const isCorrect = revealed && n === correct;
        const isWrongPick = revealed && n === picked && n !== correct;
        const isPicked = !revealed && n === picked;
        const isMarked = n === marked;
        return (
          <motion.button
            key={i}
            type="button"
            role="option"
            aria-selected={isPicked}
            disabled={!onPick}
            onClick={() => onPick?.(n)}
            animate={isWrongPick ? { x: [0, -6, 6, -3, 3, 0] } : undefined}
            transition={{ duration: 0.35 }}
            className={cn(
              "group flex w-full items-center gap-3 border-l-[3px] px-3 py-[1px] text-left transition-colors",
              onPick && "cursor-pointer enabled:hover:bg-[color-mix(in_srgb,var(--ca-accent)_14%,transparent)]",
              isCorrect && "border-success bg-success/15",
              isWrongPick && "border-error bg-error/15",
              isPicked && "border-accent bg-accent/20",
              isMarked && "border-warning bg-warning/15",
              !isCorrect && !isWrongPick && !isPicked && !isMarked && "border-transparent",
            )}
          >
            <span className="w-6 shrink-0 select-none text-right text-muted/60">{n}</span>
            <span className="min-w-0 flex-1 whitespace-pre">
              <Line toks={toks} />
            </span>
            {isCorrect && <Check size={14} className="shrink-0 text-success" strokeWidth={3} />}
            {isWrongPick && <X size={14} className="shrink-0 text-error" strokeWidth={3} />}
            {stats && (stats[i] ?? 0) > 0 && (
              <span className="shrink-0 rounded-full bg-surface-2 px-1.5 text-[11px] font-bold tabular text-muted">{stats[i]}</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
