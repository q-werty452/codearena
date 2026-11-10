import { AnimatePresence } from "motion/react";
import { ArrowLeft, Code2, FolderOpen, Library, ListChecks, Play, Save, Sparkles, Type } from "lucide-react";
import type { Task, TaskSet } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card } from "../../ui/Card.tsx";
import { Segmented } from "../../ui/Controls.tsx";
import { cn } from "../../lib/cn.ts";
import { useT } from "../../lib/i18n.ts";
import { QuestionCard, blankQuestion, cleanQuestion, questionError, type ChoiceTask } from "./QuizEditor.tsx";
import { ShortCard, blankShort, cleanShort, shortError, type ShortTask } from "./TugEditor.tsx";
import { CodeCard, blankCode, cleanCode, codeError, type CodeTaskDraft } from "./CodeEditor.tsx";

type RaceTask = ShortTask | ChoiceTask | CodeTaskDraft;
const isRace = (x: Task): x is RaceTask => x.type === "short_answer" || x.type === "choice" || x.type === "code";
const errorOf = (q: RaceTask) => (q.type === "short_answer" ? shortError(q) : q.type === "choice" ? questionError(q) : codeError(q));

const LENGTHS = [5, 10, 15, 20] as const;
const TIMES = [180, 300, 600] as const;
const PENALTY = [0, 3, 5] as const;

/** Задания для гонки: короткий ответ, варианты, код — в любом порядке. */
export function RaceEditor({
  set,
  onChange,
  raceLength,
  onRaceLength,
  roundSec,
  onRoundSec,
  wrongLockSec,
  onWrongLockSec,
  onBack,
  onStart,
  onSample,
  onBank,
  onLoad,
  onSave,
}: {
  set: TaskSet;
  onChange: (s: TaskSet) => void;
  raceLength: number;
  onRaceLength: (n: number) => void;
  roundSec: number;
  onRoundSec: (n: number) => void;
  wrongLockSec: number;
  onWrongLockSec: (n: number) => void;
  onBack: () => void;
  onStart: (tasks: Task[]) => void;
  onSample: () => void;
  onBank?: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const tasks = set.tasks.filter(isRace);
  const errors = tasks.map(errorOf);
  const bad = errors.filter(Boolean).length;
  const update = (next: RaceTask[]) => onChange({ ...set, tasks: next });
  const patch = (i: number, p: Partial<RaceTask>) => update(tasks.map((q, k) => (k === i ? ({ ...q, ...p } as RaceTask) : q)));
  const dup = (i: number) => {
    const next = [...tasks];
    next.splice(i + 1, 0, structuredClone(tasks[i]!));
    update(next);
  };
  const del = (i: number) => update(tasks.filter((_, k) => k !== i));
  const clean = (q: RaceTask): Task => (q.type === "short_answer" ? cleanShort(q, set.title) : q.type === "choice" ? cleanQuestion(q, set.title) : cleanCode(q, set.title));

  const addButtons = (
    <>
      <Button icon={<Type size={14} />} onClick={() => update([...tasks, blankShort()])}>
        {t("race.addShort")}
      </Button>
      <Button icon={<ListChecks size={14} />} onClick={() => update([...tasks, blankQuestion()])}>
        {t("race.addChoice")}
      </Button>
      <Button icon={<Code2 size={14} />} onClick={() => update([...tasks, blankCode("html")])}>
        {t("race.addCode")}
      </Button>
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-5 px-6 py-5">
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
          <h1 className="text-title font-bold">{t("race.editTitle")}</h1>
          <input
            value={set.title}
            onChange={(e) => onChange({ ...set, title: e.target.value })}
            placeholder={t("edit.setTitlePlaceholder")}
            aria-label={t("edit.setTitle")}
            maxLength={80}
            className="mt-2 h-9 w-full max-w-[420px] rounded-btn border border-border bg-input px-3 text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
          <p className="mt-2 text-[12px] text-muted">{t("race.loops")}</p>
        </div>

        {tasks.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
            <div className="text-[16px] font-semibold">{t("edit.empty")}</div>
            <p className="text-muted">{t("edit.emptyHint")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {onBank && (
                <Button variant="primary" icon={<Library size={14} />} onClick={onBank}>
                  {t("bank.open")}
                </Button>
              )}
              {addButtons}
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            <AnimatePresence initial={false}>
              {tasks.map((q, i) =>
                q.type === "short_answer" ? (
                  <ShortCard key={i} n={i + 1} q={q} error={errors[i] ?? null} active={false} autoFocus={false} onFocus={() => {}} onChange={(p) => patch(i, p)} onDuplicate={() => dup(i)} onDelete={() => del(i)} />
                ) : q.type === "choice" ? (
                  <QuestionCard key={i} n={i + 1} q={q} error={errors[i] ?? null} active={false} autoFocus={false} onFocus={() => {}} onChange={(p) => patch(i, p)} onDuplicate={() => dup(i)} onDelete={() => del(i)} />
                ) : (
                  <CodeCard key={i} n={i + 1} q={q} error={errors[i] ?? null} onChange={(p) => patch(i, p)} onDuplicate={() => dup(i)} onDelete={() => del(i)} />
                ),
              )}
            </AnimatePresence>
            <div className="flex flex-wrap gap-2">{addButtons}</div>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2">
              <span className="text-[12px] text-muted">{t("race.length")}</span>
              <Segmented<string> value={String(raceLength)} onChange={(v) => onRaceLength(Number(v))} options={LENGTHS.map((n) => ({ value: String(n), label: String(n) }))} />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[12px] text-muted">{t("race.time")}</span>
              <Segmented<string> value={String(roundSec)} onChange={(v) => onRoundSec(Number(v))} options={TIMES.map((n) => ({ value: String(n), label: t("tug.min", { n: n / 60 }) }))} />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-[12px] text-muted">{t("tug.penalty")}</span>
              <Segmented<string> value={String(wrongLockSec)} onChange={(v) => onWrongLockSec(Number(v))} options={PENALTY.map((n) => ({ value: String(n), label: t("edit.sec", { n }) }))} />
            </label>
          </div>
          <div className="flex items-center gap-3">
            {tasks.length > 0 && <span className={cn("text-[12px]", bad ? "text-warning" : "text-muted")}>{bad ? t("tug.notReady", { n: bad }) : t("race.ready", { n: tasks.length })}</span>}
            <Button variant="primary" size="lg" icon={<Play size={18} />} disabled={tasks.length === 0 || bad > 0} onClick={() => onStart(tasks.map(clean))}>
              {t("common.start")}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}
