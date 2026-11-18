import { MessageSquarePlus, Send, X } from "lucide-react";
import { useState } from "react";
import { host } from "../lib/session.ts";
import { useT } from "../lib/i18n.ts";
import { cn } from "../lib/cn.ts";
import { lines, Line } from "./Code.tsx";

/**
 * Код ученика у учителя, по которому можно подсказать: нажал на номер строки —
 * под ней поле, «Отправить» — ученик видит подсказку у себя на этой строке
 * (подсветка в редакторе, исчезает, когда он строку исправит). Код ученика не меняется.
 */
export function HintableCode({ code, lang, playerId }: { code: string; lang: string; playerId: string }) {
  const t = useT();
  const ls = lines(code, lang);
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [sent, setSent] = useState<Record<number, string>>({});

  const send = (line: number) => {
    const v = text.trim();
    if (!v) return;
    host.send({ type: "hint", playerId, line: line + 1, text: v.slice(0, 300) });
    setSent((s) => ({ ...s, [line]: v }));
    setOpen(null);
    setText("");
  };

  return (
    <div className="overflow-x-auto rounded-btn border border-border bg-[var(--vscode-textCodeBlock-background,var(--ca-surface))] p-3 font-mono text-[13px] leading-[1.55]">
      <div className="grid grid-cols-[auto_1fr] gap-x-3">
        {ls.map((toks, i) => (
          <div key={i} className="contents">
            <button
              type="button"
              onClick={() => {
                setOpen(open === i ? null : i);
                setText(sent[i] ?? "");
              }}
              title={t("hint.onLine", { n: i + 1 })}
              aria-label={t("hint.onLine", { n: i + 1 })}
              className={cn(
                "group flex select-none items-center justify-end gap-1 rounded-[4px] px-1 text-right text-muted/60 transition-colors hover:bg-hover hover:text-fg",
                (open === i || sent[i]) && "text-warning",
              )}
            >
              <MessageSquarePlus size={11} className="opacity-0 group-hover:opacity-100" />
              {i + 1}
            </button>
            <span className={cn("whitespace-pre", sent[i] && "bg-warning/10")}>
              <Line toks={toks} />
            </span>
            {sent[i] && open !== i && (
              <>
                <span />
                <span className="whitespace-normal pb-1 font-sans text-[12px] font-semibold text-warning">💬 {sent[i]}</span>
              </>
            )}
            {open === i && (
              <>
                <span />
                <div className="flex items-center gap-1.5 py-1 font-sans">
                  <input
                    autoFocus
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") send(i);
                      if (e.key === "Escape") setOpen(null);
                    }}
                    maxLength={300}
                    placeholder={t("hint.placeholder")}
                    className="h-8 min-w-0 flex-1 rounded-btn border border-border bg-input px-2.5 text-[13px] outline-none focus:border-[var(--ca-focus)]"
                  />
                  <button type="button" onClick={() => send(i)} disabled={!text.trim()} className="inline-flex h-8 items-center gap-1 rounded-btn bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:opacity-40">
                    <Send size={12} /> {t("hint.send")}
                  </button>
                  <button type="button" onClick={() => setOpen(null)} aria-label="close" className="flex size-8 items-center justify-center rounded-btn text-muted hover:bg-hover hover:text-fg">
                    <X size={14} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="mt-2 font-sans text-[11px] text-muted">{t("hint.how")}</p>
    </div>
  );
}
