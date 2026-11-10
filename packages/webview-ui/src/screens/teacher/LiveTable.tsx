import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ShieldAlert, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { GameSnapshot, PlayerInfo, SessionSnapshot } from "@codearena/shared";
import { Avatar } from "../../ui/Avatar.tsx";
import { CodeBlock } from "../../ui/Code.tsx";
import { FlagBadges, flagCount, flagText, FLAG_KINDS } from "../../ui/Flags.tsx";
import { cn } from "../../lib/cn.ts";
import { useT, type MessageKey } from "../../lib/i18n.ts";

type Status = "thinking" | "submitted" | "solved" | "wrong";
const STATUS_COLOR: Record<Status, string> = { thinking: "var(--ca-muted)", submitted: "var(--ca-accent)", solved: "var(--ca-success)", wrong: "var(--ca-error)" };

/** Статус ученика по текущему заданию: думает / отправил / решил / ошибся. */
export function liveStatus(g: GameSnapshot, playerId: string): Status {
  if (g.kind === "race") {
    const me = g.leaders.find((l) => l.id === playerId);
    return me && me.progress >= g.count ? "solved" : "thinking";
  }
  const sub = g.submissions[playerId];
  if (!sub) return "thinking";
  const single = g.task?.type === "choice" || g.task?.type === "find_line" || g.task?.type === "best_variant";
  // В викторине правильность не раскрываем до показа ответа.
  if (single && g.phase !== "reveal") return "submitted";
  return sub.correct ? "solved" : "wrong";
}

/** Кнопка «Ученики» + шторка с живой таблицей: статус, очки, флаги, последний ответ. */
export function LiveTable({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const players = session.lobby?.players ?? [];
  const flagged = players.filter((p) => flagCount(g.flags[p.id]) > 0).length;

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const score = (id: string) => g.leaders.find((l) => l.id === id)?.score ?? 0;
  const sorted = [...players].sort((a, b) => flagCount(g.flags[b.id]) - flagCount(g.flags[a.id]) || score(b.id) - score(a.id));

  return (
    <>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-20 right-5 z-30 inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[13px] font-semibold shadow-lg backdrop-blur",
          flagged ? "border-warning/60 bg-[color-mix(in_srgb,var(--ca-warning)_18%,var(--ca-bg))] text-warning" : "border-border bg-[color-mix(in_srgb,var(--ca-bg)_90%,transparent)] text-fg",
        )}
      >
        <Users size={15} />
        {t("live.open")}
        {flagged > 0 && (
          <span className="inline-flex items-center gap-1">
            · <ShieldAlert size={14} /> {t("live.flagged", { n: flagged })}
          </span>
        )}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-40 bg-black/35" onClick={() => setOpen(false)}>
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col border-l border-border bg-[var(--vscode-editor-background,var(--ca-bg))] shadow-2xl"
              role="dialog"
              aria-label={t("live.title")}
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-3.5">
                <Users size={18} className="text-muted" />
                <h2 className="flex-1 text-[16px] font-bold">
                  {t("live.title")} · {players.length}
                </h2>
                <button onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg" aria-label={t("live.close")}>
                  <X size={16} />
                </button>
              </div>
              <ul className="flex-1 overflow-y-auto p-2">
                {sorted.map((p) => (
                  <Row key={p.id} p={p} g={g} score={score(p.id)} open={expanded === p.id} onToggle={() => setExpanded(expanded === p.id ? null : p.id)} />
                ))}
              </ul>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function Row({ p, g, score, open, onToggle }: { p: PlayerInfo; g: GameSnapshot; score: number; open: boolean; onToggle: () => void }) {
  const t = useT();
  const st = liveStatus(g, p.id);
  const flags = g.flags[p.id];
  const sub = g.submissions[p.id];
  const answerText = (() => {
    if (!sub) return null;
    if (sub.code) return null;
    const task = g.task;
    if (task?.type === "choice" && typeof sub.answer === "number") return task.options[sub.answer] ?? String(sub.answer);
    if (task?.type === "best_variant" && typeof sub.answer === "number") return t("bug.variant", { n: sub.answer + 1 });
    if (task?.type === "find_line" && typeof sub.answer === "number") return t("bug.line", { n: sub.answer });
    return sub.answer !== undefined ? String(sub.answer) : null;
  })();
  const lang = g.task && "language" in g.task ? g.task.language : "javascript";

  return (
    <li className="border-b border-border last:border-0">
      <button onClick={onToggle} className="flex min-h-11 w-full items-center gap-2.5 rounded-[8px] px-2 py-1.5 text-left hover:bg-hover">
        <Avatar name={p.name} team={p.team} size={26} offline={!p.connected} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{p.name}</span>
        <FlagBadges flags={flags} />
        <span className="w-[74px] text-right text-[12px] font-semibold" style={{ color: STATUS_COLOR[st] }}>
          {t(`live.status.${st}` as MessageKey)}
        </span>
        <span className="w-12 text-right text-[13px] font-bold tabular">{score}</span>
        <ChevronDown size={14} className={cn("text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-3 pb-3">
            {flags && flagCount(flags) > 0 ? (
              <ul className="mb-2 flex flex-col gap-0.5 text-[12px] text-warning">
                {FLAG_KINDS.filter((k) => flags[k]).map((k) => (
                  <li key={k}>⚑ {flagText(k, flags[k]!, t)}</li>
                ))}
              </ul>
            ) : (
              <p className="mb-2 text-[12px] text-muted">{t("live.noFlags")}</p>
            )}
            {sub?.code && <CodeBlock code={sub.code} lang={lang} lineNumbers />}
            {sub?.report && sub.report.failures.length > 0 && (
              <ul className="mt-1.5 flex flex-col gap-0.5 font-mono text-[12px] text-error">
                {sub.report.failures.slice(0, 5).map((f, i) => (
                  <li key={i}>
                    ✗ {f.name}
                    {f.expected ? ` → ${f.expected}` : ""} · {f.got}
                  </li>
                ))}
              </ul>
            )}
            {answerText !== null && (
              <p className="text-[13px]">
                <span className="text-muted">{t("live.lastAnswer")}: </span>
                <span className="font-mono font-semibold">{answerText}</span>
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
