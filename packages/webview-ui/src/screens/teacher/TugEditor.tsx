import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Copy, FolderOpen, Play, Plus, Save, Sparkles, Trash2, Library } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Task, TaskSet } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card, SectionTitle } from "../../ui/Card.tsx";
import { Segmented, Toggle } from "../../ui/Controls.tsx";
import { TugTaskView } from "../StudentTug.tsx";
import { cn } from "../../lib/cn.ts";
import { useT } from "../../lib/i18n.ts";

export type ShortTask = Extract<Task, { type: "short_answer" }>;

export function blankShort(): ShortTask {
  return { type: "short_answer", topic: "", difficulty: "easy", timeLimitSec: 60, prompt: "", answers: [], caseSensitive: false };
}

export function shortError(q: ShortTask): "edit.errPrompt" | "tug.errAnswer" | null {
  if (!q.prompt.trim()) return "edit.errPrompt";
  if (!q.answers.some((a) => a.trim())) return "tug.errAnswer";
  return null;
}

function cleanShort(q: ShortTask, topic: string): ShortTask {
  return { ...q, topic: q.topic || topic || "Tug", prompt: q.prompt.trim(), answers: q.answers.map((a) => a.trim()).filter(Boolean) };
}

const ROUND = [60, 120, 180, 300] as const;
const PENALTY = [0, 3, 5, 10] as const;

export function TugEditor({
  set,
  onChange,
  roundSec,
  onRoundSec,
  wrongLockSec,
  onWrongLockSec,
  canStart,
  onBack,
  onStart,
  onSample,
  onBank,
  onLoad,
  onSave,
}: {
  set: TaskSet;
  onChange: (s: TaskSet) => void;
  roundSec: number;
  onRoundSec: (n: number) => void;
  wrongLockSec: number;
  onWrongLockSec: (n: number) => void;
  canStart: boolean;
  onBack: () => void;
  onStart: (tasks: Task[]) => void;
  onSample: () => void;
  onBank?: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const tasks = set.tasks.filter((x): x is ShortTask => x.type === "short_answer");
  const [selected, setSelected] = useState(0);
  const sel = tasks[Math.min(selected, tasks.length - 1)];
  const errors = tasks.map(shortError);
  const bad = errors.filter(Boolean).length;
  const lastAdded = useRef<number | null>(null);

  const update = (next: ShortTask[]) => onChange({ ...set, tasks: next });
  const patch = (i: number, p: Partial<ShortTask>) => update(tasks.map((q, k) => (k === i ? { ...q, ...p } : q)));
  const add = () => {
    lastAdded.current = tasks.length;
    update([...tasks, blankShort()]);
    setSelected(tasks.length);
  };

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
            {t("pick.title")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {onBank && (
              <Button size="sm" icon={<Library size={14} />} onClick={onBank}>
                {t("bank.open")}
              </Button>
            )}
            <Button size="sm" icon={<Sparkles size={14} />} onClick={onSample}>
              {t("edit.sample")}
            </Button>
            <Button size="sm" icon={<FolderOpen size={14} />} onClick={onLoad}>
              {t("edit.load")}
            </Button>
            <Button size="sm" icon={<Save size={14} />} onClick={onSave} disabled={tasks.length === 0}>
              {t("edit.save")}
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-title font-bold">{t("tug.editTitle")}</h1>
          <input
            value={set.title}
            onChange={(e) => onChange({ ...set, title: e.target.value })}
            placeholder={t("edit.setTitlePlaceholder")}
            aria-label={t("edit.setTitle")}
            maxLength={80}
            className="mt-2 h-9 w-full max-w-[420px] rounded-btn border border-border bg-input px-3 text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
          <p className="mt-2 text-[12px] text-muted">{t("tug.loops")}</p>
        </div>

        {tasks.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
            <div className="text-[16px] font-semibold">{t("edit.empty")}</div>
            <p className="text-muted">{t("edit.emptyHint")}</p>
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus size={14} />} onClick={add}>
                {t("tug.add")}
              </Button>
              <Button icon={<Sparkles size={14} />} onClick={onSample}>
                {t("edit.sample")}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
            <div className="flex flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {tasks.map((q, i) => (
                  <ShortCard
                    key={i}
                    n={i + 1}
                    q={q}
                    error={errors[i] ?? null}
                    active={q === sel}
                    autoFocus={lastAdded.current === i}
                    onFocus={() => setSelected(i)}
                    onChange={(p) => patch(i, p)}
                    onDuplicate={() => {
                      const next = [...tasks];
                      next.splice(i + 1, 0, structuredClone(q));
                      update(next);
                    }}
                    onDelete={() => {
                      update(tasks.filter((_, k) => k !== i));
                      setSelected(Math.max(0, i - 1));
                    }}
                  />
                ))}
              </AnimatePresence>
              <Button icon={<Plus size={14} />} onClick={add} className="self-start">
                {t("tug.add")}
              </Button>
            </div>
            {sel && (
              <div className="sticky top-4">
                <SectionTitle>{t("edit.preview")}</SectionTitle>
                <Card className="p-6">
                  <TugTaskView prompt={sel.prompt || t("tug.promptPlaceholder")} value="" disabled />
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-[12px] text-muted">{t("tug.roundTime")}</span>
              <Segmented<string> value={String(roundSec)} onChange={(v) => onRoundSec(Number(v))} options={ROUND.map((n) => ({ value: String(n), label: t("tug.min", { n: n / 60 }) }))} />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[12px] text-muted">{t("tug.penalty")}</span>
              <Segmented<string> value={String(wrongLockSec)} onChange={(v) => onWrongLockSec(Number(v))} options={PENALTY.map((n) => ({ value: String(n), label: t("edit.sec", { n }) }))} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn("text-[12px]", !canStart || bad ? "text-warning" : "text-muted")}>
              {!canStart ? t("tug.needTeams") : bad ? t("tug.notReady", { n: bad }) : tasks.length ? t("tug.ready", { n: tasks.length }) : ""}
            </span>
            <Button
              variant="primary"
              size="lg"
              icon={<Play size={18} />}
              disabled={!canStart || tasks.length === 0 || bad > 0}
              onClick={() => onStart(tasks.map((q) => cleanShort(q, set.title)))}
            >
              {t("common.start")}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function ShortCard({
  n,
  q,
  error,
  active,
  autoFocus,
  onFocus,
  onChange,
  onDuplicate,
  onDelete,
}: {
  n: number;
  q: ShortTask;
  error: string | null;
  active: boolean;
  autoFocus: boolean;
  onFocus: () => void;
  onChange: (p: Partial<ShortTask>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const promptRef = useRef<HTMLInputElement>(null);
  // Ответы редактируются строкой «13, тринадцать» и превращаются в список.
  const [answersText, setAnswersText] = useState(q.answers.join(", "));
  useEffect(() => {
    if (autoFocus) promptRef.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (q.answers.join(", ") !== answersText.split(",").map((a) => a.trim()).filter(Boolean).join(", ")) setAnswersText(q.answers.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.answers]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.18 }}
      onFocusCapture={onFocus}
      onClick={onFocus}
      className={cn(
        "grid grid-cols-[auto_1fr_auto] items-start gap-3 rounded-card border bg-surface p-3.5 transition-colors",
        active ? "border-[color-mix(in_srgb,var(--ca-accent)_60%,var(--ca-border))]" : "border-border",
      )}
    >
      <span className="mt-2 w-6 text-center text-[12px] font-semibold tabular text-muted">{n}</span>
      <div className="flex min-w-0 flex-col gap-2">
        <input
          ref={promptRef}
          value={q.prompt}
          onChange={(e) => onChange({ prompt: e.target.value })}
          placeholder={t("tug.promptPlaceholder")}
          aria-label={t("tug.prompt")}
          maxLength={300}
          className="h-9 w-full rounded-btn border border-border bg-input px-3 font-mono text-[15px] font-semibold outline-none focus:border-[var(--ca-focus)]"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-muted">=</span>
          <input
            value={answersText}
            onChange={(e) => {
              setAnswersText(e.target.value);
              onChange({ answers: e.target.value.split(",").map((a) => a.trim()).filter(Boolean) });
            }}
            placeholder={t("tug.answersPlaceholder")}
            aria-label={t("tug.answers")}
            title={t("tug.answersHint")}
            maxLength={200}
            className="h-8 min-w-[120px] flex-1 rounded-btn border border-success/40 bg-input px-3 font-mono text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
          <Toggle checked={q.caseSensitive} onChange={(v) => onChange({ caseSensitive: v })} label={<span className="text-[12px] text-muted">{t("tug.caseSensitive")}</span>} />
        </div>
        {error && <span className="text-[12px] text-warning">{t(error as "edit.errPrompt")}</span>}
      </div>
      <div className="flex">
        <button type="button" title={t("edit.duplicate")} onClick={(e) => (e.stopPropagation(), onDuplicate())} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
          <Copy size={14} />
        </button>
        <button type="button" title={t("edit.delete")} onClick={(e) => (e.stopPropagation(), onDelete())} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-error/10 hover:text-error">
          <Trash2 size={14} />
        </button>
      </div>
    </motion.div>
  );
}
