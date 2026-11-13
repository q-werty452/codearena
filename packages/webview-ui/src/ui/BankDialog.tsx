import { AnimatePresence, motion } from "motion/react";
import { FileUp, Library, Plus, Sparkles, ClipboardPaste, Trash2, X } from "lucide-react";
import { useContext, useEffect } from "react";
import type { GameKind, Task } from "@codearena/shared";
import { Button } from "./Button.tsx";
import { bankFor } from "../lib/bank.ts";
import { tasksFor, useMyTasks } from "../lib/myTasks.ts";
import { host } from "../lib/session.ts";
import { LocaleContext, useT } from "../lib/i18n.ts";

const LANG_LABEL: Record<string, string> = { html: "HTML", css: "CSS", javascript: "JavaScript", python: "Python", dart: "Dart" };

/** Окно «Банк задач»: наборы для выбранной игры, добавляются к списку учителя. */
export function BankDialog({ game, open, onClose, onAdd }: { game: GameKind; open: boolean; onClose: () => void; onAdd: (tasks: Task[], title: string) => void }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const sets = bankFor(game);
  const mine = useMyTasks().sets.map((s) => ({ s, tasks: tasksFor(s, game) })).filter((x) => x.tasks.length);
  const SRC = { file: FileUp, ai: Sparkles, paste: ClipboardPaste } as const;
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-6 backdrop-blur-[2px]" onClick={onClose}>
          <motion.div
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-10 w-full max-w-[640px] rounded-card border border-border bg-[var(--vscode-editor-background,var(--ca-bg))] p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label={t("bank.title")}
          >
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-[10px] bg-surface-2 text-muted">
                <Library size={18} />
              </span>
              <div className="flex-1">
                <h2 className="text-[18px] font-semibold">{t("bank.title")}</h2>
                <p className="text-[12px] text-muted">{t("bank.hint")}</p>
              </div>
              <button onClick={onClose} className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg" aria-label="close">
                <X size={16} />
              </button>
            </div>
            {mine.length > 0 && (
              <div className="mt-4">
                <h3 className="mb-2 text-[12px] font-medium text-muted">{t("my.title")}</h3>
                <div className="flex flex-col gap-2">
                  {mine.map(({ s, tasks }) => {
                    const Icon = SRC[s.source];
                    return (
                      <div key={s.id} className="flex items-center gap-3 rounded-card border border-accent/30 bg-accent/[0.05] px-4 py-3">
                        <Icon size={16} className="shrink-0 text-muted" />
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold">{s.title}</div>
                          <div className="text-[11px] text-muted">
                            {t(`my.source.${s.source}`)} · {new Date(s.createdAt).toLocaleDateString(locale === "ru" ? "ru-RU" : "en-GB")}
                            {s.fileName ? ` · ${s.fileName}` : ""}
                          </div>
                        </div>
                        <button
                          onClick={() => host.post({ type: "my_tasks_delete", id: s.id })}
                          className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-error/10 hover:text-error"
                          aria-label={t("my.delete")}
                          title={t("my.delete")}
                        >
                          <Trash2 size={15} />
                        </button>
                        <Button
                          variant="primary"
                          size="sm"
                          icon={<Plus size={14} />}
                          onClick={() => {
                            onAdd(structuredClone(tasks), s.title);
                            onClose();
                          }}
                        >
                          {t("bank.add", { n: tasks.length })}
                        </Button>
                      </div>
                    );
                  })}
                </div>
                <h3 className="mb-2 mt-5 text-[12px] font-medium text-muted">{t("bank.title")}</h3>
              </div>
            )}
            <div className={mine.length ? "flex flex-col gap-2.5" : "mt-4 flex flex-col gap-2.5"}>
              {sets.length === 0 && <p className="py-8 text-center text-muted">{t("bank.empty")}</p>}
              {sets.map(({ id, set }) => {
                const langs = [...new Set(set.tasks.flatMap((x) => ("language" in x ? [x.language] : [x.topic])))].slice(0, 4);
                return (
                  <div key={id} className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{set.title}</div>
                      {set.description && <p className="mt-0.5 text-[12px] text-muted">{set.description}</p>}
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {langs.map((l) => (
                          <span key={l} className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-muted">
                            {LANG_LABEL[l] ?? l}
                          </span>
                        ))}
                        {set.author && <span className="text-[11px] text-muted">· {set.author}</span>}
                      </div>
                    </div>
                    <Button
                      variant="primary"
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={() => {
                        onAdd(structuredClone(set.tasks), set.title);
                        onClose();
                      }}
                    >
                      {t("bank.add", { n: set.tasks.length })}
                    </Button>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
