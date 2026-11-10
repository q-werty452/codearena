import { AnimatePresence, motion } from "motion/react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, Copy, FolderOpen, Play, Plus, Save, Sparkles, Trash2, X, Library } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OPTION_SHAPES, type Task, type TaskSet } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card, SectionTitle } from "../../ui/Card.tsx";
import { Segmented } from "../../ui/Controls.tsx";
import { Shape } from "../../ui/Shapes.tsx";
import { QuestionView } from "../../ui/Game.tsx";
import { cn } from "../../lib/cn.ts";
import { useT } from "../../lib/i18n.ts";

export type ChoiceTask = Extract<Task, { type: "choice" }>;

export function blankQuestion(): ChoiceTask {
  return { type: "choice", topic: "", difficulty: "easy", timeLimitSec: 20, prompt: "", options: ["", "", "", ""], correct: 0 };
}

/** Проверка вопроса: null — готов, иначе текст ошибки (ключ i18n). */
export function questionError(q: ChoiceTask): "edit.errPrompt" | "edit.errOptions" | null {
  if (!q.prompt.trim()) return "edit.errPrompt";
  const filled = q.options.filter((o) => o.trim());
  if (filled.length < 2 || !q.options[q.correct]?.trim()) return "edit.errOptions";
  return null;
}

/** Убрать пустые варианты и пересчитать индекс правильного. */
export function cleanQuestion(q: ChoiceTask, topic: string): ChoiceTask {
  const keep = q.options.map((o, i) => ({ o: o.trim(), i })).filter((x) => x.o);
  return {
    ...q,
    topic: q.topic || topic || "Quiz",
    prompt: q.prompt.trim(),
    options: keep.map((x) => x.o),
    correct: Math.max(0, keep.findIndex((x) => x.i === q.correct)),
    explanation: q.explanation?.trim() || undefined,
  };
}

const TIMES = [10, 20, 30, 60] as const;

export function QuizEditor({
  set,
  onChange,
  questionSec,
  onQuestionSec,
  onBack,
  onStart,
  onSample,
  onBank,
  onLoad,
  onSave,
}: {
  set: TaskSet;
  onChange: (s: TaskSet) => void;
  questionSec: number;
  onQuestionSec: (n: number) => void;
  onBack: () => void;
  onStart: (tasks: Task[]) => void;
  onSample: () => void;
  onBank?: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const questions = set.tasks.filter((x): x is ChoiceTask => x.type === "choice");
  const [selected, setSelected] = useState(0);
  const sel = questions[Math.min(selected, questions.length - 1)];
  const errors = questions.map(questionError);
  const bad = errors.filter(Boolean).length;
  const lastAdded = useRef<number | null>(null);

  const update = (tasks: ChoiceTask[]) => onChange({ ...set, tasks });
  const patch = (i: number, p: Partial<ChoiceTask>) => update(questions.map((q, k) => (k === i ? { ...q, ...p } : q)));
  const add = () => {
    lastAdded.current = questions.length;
    update([...questions, blankQuestion()]);
    setSelected(questions.length);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    [next[i], next[j]] = [next[j]!, next[i]!];
    update(next);
    setSelected(j);
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
            <Button size="sm" icon={<Save size={14} />} onClick={onSave} disabled={questions.length === 0}>
              {t("edit.save")}
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-title font-bold">{t("edit.title")}</h1>
          <input
            value={set.title}
            onChange={(e) => onChange({ ...set, title: e.target.value })}
            placeholder={t("edit.setTitlePlaceholder")}
            aria-label={t("edit.setTitle")}
            maxLength={80}
            className="mt-2 h-9 w-full max-w-[420px] rounded-btn border border-border bg-input px-3 text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
        </div>

        {questions.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
            <div className="text-[16px] font-semibold">{t("edit.empty")}</div>
            <p className="text-muted">{t("edit.emptyHint")}</p>
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus size={14} />} onClick={add}>
                {t("edit.add")}
              </Button>
              <Button icon={<Sparkles size={14} />} onClick={onSample}>
                {t("edit.sample")}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr))]">
            <div className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {questions.map((q, i) => (
                  <QuestionCard
                    key={i}
                    n={i + 1}
                    q={q}
                    error={errors[i] ?? null}
                    active={q === sel}
                    autoFocus={lastAdded.current === i}
                    onFocus={() => setSelected(i)}
                    onChange={(p) => patch(i, p)}
                    onUp={i > 0 ? () => move(i, -1) : undefined}
                    onDown={i < questions.length - 1 ? () => move(i, 1) : undefined}
                    onDuplicate={() => {
                      const next = [...questions];
                      next.splice(i + 1, 0, structuredClone(q));
                      update(next);
                      setSelected(i + 1);
                    }}
                    onDelete={() => {
                      update(questions.filter((_, k) => k !== i));
                      setSelected(Math.max(0, i - 1));
                    }}
                  />
                ))}
              </AnimatePresence>
              <Button icon={<Plus size={14} />} onClick={add} className="self-start">
                {t("edit.add")}
              </Button>
            </div>

            {sel && (
              <div className="sticky top-4">
                <SectionTitle>{t("edit.preview")}</SectionTitle>
                <Card className="p-5">
                  <QuestionView
                    prompt={sel.prompt || t("edit.promptPlaceholder")}
                    options={sel.options.map((o, i) => o || t("edit.option", { n: i + 1 }))}
                    states={sel.options.map((o) => (o.trim() ? "idle" : "dim"))}
                  />
                </Card>
              </div>
            )}
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-muted">{t("edit.time")}</span>
            <Segmented<string>
              value={String(questionSec)}
              onChange={(v) => onQuestionSec(Number(v))}
              options={TIMES.map((n) => ({ value: String(n), label: t("edit.sec", { n }) }))}
            />
          </div>
          <div className="flex items-center gap-3">
            {questions.length > 0 && (
              <span className={cn("text-[12px]", bad ? "text-warning" : "text-muted")}>
                {bad ? t("edit.notReady", { n: bad }) : t("edit.ready", { n: questions.length })}
              </span>
            )}
            <Button
              variant="primary"
              size="lg"
              icon={<Play size={18} />}
              disabled={questions.length === 0 || bad > 0}
              onClick={() => onStart(questions.map((q) => cleanQuestion(q, set.title)))}
            >
              {t("common.start")}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function QuestionCard({
  n,
  q,
  error,
  active,
  autoFocus,
  onFocus,
  onChange,
  onUp,
  onDown,
  onDuplicate,
  onDelete,
}: {
  n: number;
  q: ChoiceTask;
  error: string | null;
  active: boolean;
  autoFocus: boolean;
  onFocus: () => void;
  onChange: (p: Partial<ChoiceTask>) => void;
  onUp?: () => void;
  onDown?: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) promptRef.current?.focus();
  }, [autoFocus]);
  // Высота текста вопроса подстраивается под содержимое.
  useEffect(() => {
    const el = promptRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [q.prompt]);

  const setOption = (i: number, v: string) => onChange({ options: q.options.map((o, k) => (k === i ? v : o)) });
  const removeOption = (i: number) => {
    const options = q.options.filter((_, k) => k !== i);
    onChange({ options, correct: q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct });
  };

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
        "rounded-card border bg-surface p-4 transition-colors",
        active ? "border-[color-mix(in_srgb,var(--ca-accent)_60%,var(--ca-border))]" : "border-border",
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tabular text-muted">{t("edit.question", { n })}</span>
        {error && <span className="text-[12px] text-warning">{t(error as "edit.errPrompt")}</span>}
        <div className="ml-auto flex items-center">
          <IconBtn label={t("edit.moveUp")} onClick={onUp} icon={<ArrowUp size={14} />} />
          <IconBtn label={t("edit.moveDown")} onClick={onDown} icon={<ArrowDown size={14} />} />
          <IconBtn label={t("edit.duplicate")} onClick={onDuplicate} icon={<Copy size={14} />} />
          <IconBtn label={t("edit.delete")} onClick={onDelete} icon={<Trash2 size={14} />} danger />
        </div>
      </div>

      <textarea
        ref={promptRef}
        rows={1}
        value={q.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder={t("edit.promptPlaceholder")}
        aria-label={t("edit.prompt")}
        maxLength={500}
        className="w-full resize-none overflow-hidden rounded-btn border border-border bg-input px-3 py-2 text-[15px] font-semibold leading-snug outline-none focus:border-[var(--ca-focus)]"
      />

      <div className="mt-3 flex flex-col gap-2">
        {q.options.map((o, i) => {
          const correct = q.correct === i;
          return (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChange({ correct: i })}
                title={t("edit.correctHint")}
                aria-pressed={correct}
                className={cn(
                  "relative flex size-9 shrink-0 items-center justify-center rounded-[9px] text-white transition-transform hover:scale-105",
                  correct && "ring-2 ring-success ring-offset-2 ring-offset-[var(--ca-surface)]",
                )}
                style={{ background: `var(--ca-opt-${i})` }}
              >
                <Shape shape={OPTION_SHAPES[i]!} size={14} />
                {correct && (
                  <span className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full bg-success">
                    <Check size={10} strokeWidth={4} />
                  </span>
                )}
              </button>
              <input
                value={o}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={t("edit.option", { n: i + 1 })}
                maxLength={200}
                className={cn(
                  "h-9 min-w-0 flex-1 rounded-btn border bg-input px-3 text-[13px] outline-none focus:border-[var(--ca-focus)]",
                  correct ? "border-success/50" : "border-border",
                )}
              />
              {q.options.length > 2 && <IconBtn label={t("edit.delete")} onClick={() => removeOption(i)} icon={<X size={14} />} />}
            </div>
          );
        })}
        <div className="flex items-center justify-between gap-2">
          {q.options.length < 4 ? (
            <button
              type="button"
              onClick={() => onChange({ options: [...q.options, ""] })}
              className="inline-flex items-center gap-1.5 rounded-[6px] px-1 py-1 text-[12px] text-muted hover:text-fg"
            >
              <Plus size={13} /> {t("edit.addOption")}
            </button>
          ) : (
            <span />
          )}
          <span className="text-[11px] text-muted">{t("edit.correctHint")}</span>
        </div>
      </div>

      <input
        value={q.explanation ?? ""}
        onChange={(e) => onChange({ explanation: e.target.value })}
        placeholder={t("edit.explanationPlaceholder")}
        aria-label={t("edit.explanation")}
        maxLength={300}
        className="mt-3 h-9 w-full rounded-btn border border-dashed border-border bg-transparent px-3 text-[13px] outline-none placeholder:text-muted/70 focus:border-solid focus:border-[var(--ca-focus)]"
      />
    </motion.div>
  );
}

function IconBtn({ label, onClick, icon, danger }: { label: string; onClick?: () => void; icon: React.ReactNode; danger?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={!onClick}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      className={cn(
        "flex size-7 items-center justify-center rounded-[7px] text-muted transition-colors disabled:opacity-30",
        danger ? "hover:bg-error/10 hover:text-error" : "hover:bg-hover hover:text-fg",
      )}
    >
      {icon}
    </button>
  );
}
