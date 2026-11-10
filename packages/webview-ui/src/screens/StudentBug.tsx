import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, Clock, FileCode2, Play, Send, Wrench, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { OPTION_SHAPES, type GameSnapshot, type SessionSnapshot } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { Card, Kbd, SectionTitle } from "../ui/Card.tsx";
import { ClickableCode, CodeBlock } from "../ui/Code.tsx";
import { TimerRing } from "../ui/Controls.tsx";
import { CodeAwareText, Leaderboard } from "../ui/Game.tsx";
import { Shape } from "../ui/Shapes.tsx";
import { cn } from "../lib/cn.ts";
import { play, secondsLeft, useNow } from "../lib/game.ts";
import { useT, type MessageKey } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";
import { NoPython, TestRow, noRuntime } from "./StudentCodewars.tsx";
import { formatClock } from "./StudentTug.tsx";

type AnyTask = NonNullable<GameSnapshot["task"]>;
type FindTask = Extract<AnyTask, { type: "find_line" }>;
type BestTask = Extract<AnyTask, { type: "best_variant" }>;
type FixTask = Extract<AnyTask, { type: "fix_bug" }>;

const LANG: Record<string, string> = { html: "HTML", css: "CSS", javascript: "JavaScript", python: "Python", dart: "Dart" };

export const bugKindKey = (type: string): MessageKey => (type === "find_line" ? "bug.find" : type === "fix_bug" ? "bug.fix" : "bug.best");

/** «Найди баг» у ученика: три вида заданий. */
export function StudentBugBody({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const task = g.task;
  if (!task) return null;
  if (task.type === "fix_bug") return <FixBody g={g} task={task as FixTask} meId={session.me?.playerId} />;
  if (task.type === "find_line" || task.type === "best_variant") return <PickBody g={g} task={task as FindTask | BestTask} meId={session.me?.playerId} />;
  return null;
}

function TaskHead({ g, task, left, total }: { g: GameSnapshot; task: AnyTask; left: number; total: number }) {
  const t = useT();
  const lang = "language" in task ? LANG[task.language] : "";
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[12px] font-semibold text-warning">{t(bugKindKey(task.type))}</span>
        {lang && <span className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted">{lang}</span>}
        <span className="text-[13px] text-muted tabular">
          {g.index + 1} / {g.count}
        </span>
      </div>
      {g.phase === "playing" && (total > 90 ? (
        <span className={cn("inline-flex items-center gap-1.5 font-mono text-[20px] font-bold tabular", left <= 30 && "text-warning")}>
          <Clock size={15} className="text-muted" />
          {formatClock(left)}
        </span>
      ) : (
        <TimerRing left={left} total={total} size={52} />
      ))}
    </div>
  );
}

/* ───────────────────────── Найди строку / выбери лучший ───────────────────────── */

function PickBody({ g, task, meId }: { g: GameSnapshot; task: FindTask | BestTask; meId?: string }) {
  const t = useT();
  const now = useNow();
  const left = secondsLeft(g, now);
  const revealed = g.phase === "reveal";
  const picked = typeof g.myAnswer === "number" ? g.myAnswer : null;
  const correct = revealed ? (g.reveal?.answer as number) : null;
  const canPick = g.phase === "playing" && picked === null && left > 0;
  const pick = (v: number) => canPick && host.post({ type: "answer", taskId: task.id, answer: v });

  // Клавиши 1–4 выбирают вариант кода.
  const pickRef = useRef(pick);
  pickRef.current = pick;
  useEffect(() => {
    if (task.type !== "best_variant") return;
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= task.variants.length && !e.ctrlKey && !e.metaKey && !e.altKey) pickRef.current(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task]);

  useEffect(() => {
    if (revealed && g.result) play(g.result.correct ? "correct" : "wrong");
  }, [revealed, g.result]);

  const place = meId ? g.leaders.findIndex((l) => l.id === meId) + 1 : 0;

  return (
    <div className="flex flex-col gap-5">
      <TaskHead g={g} task={task} left={left} total={(g.limitMs ?? 20000) / 1000} />
      {revealed && <ResultBanner correct={!!g.result?.correct} points={g.result?.points ?? 0} answered={picked !== null} place={place} />}
      <h2 className="text-[20px] font-bold leading-snug">
        <CodeAwareText text={task.prompt || t(task.type === "find_line" ? "bug.findHint" : "bug.bestHint")} />
      </h2>

      {task.type === "find_line" ? (
        <ClickableCode code={task.code} lang={task.language} onPick={canPick ? pick : undefined} picked={picked} correct={correct} stats={revealed ? g.reveal?.stats : undefined} />
      ) : (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
          {task.variants.map((v, i) => {
            const state = revealed ? (i === correct ? "correct" : i === picked ? "wrong" : "dim") : picked === null ? "idle" : i === picked ? "picked" : "dim";
            return (
              <motion.button
                key={i}
                type="button"
                disabled={!canPick}
                onClick={() => pick(i)}
                whileHover={canPick ? { y: -2 } : undefined}
                whileTap={canPick ? { scale: 0.98 } : undefined}
                animate={{ opacity: state === "dim" ? 0.45 : 1 }}
                className={cn(
                  "relative flex flex-col gap-2 rounded-card border-2 bg-surface p-3 text-left transition-colors",
                  state === "correct" ? "border-success" : state === "wrong" ? "border-error" : state === "picked" ? "border-accent" : "border-border",
                  canPick && "hover:border-[var(--ca-accent)]",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="flex size-7 items-center justify-center rounded-[8px] text-white" style={{ background: `var(--ca-opt-${i})` }}>
                    <Shape shape={OPTION_SHAPES[i]!} size={12} />
                  </span>
                  <span className="text-[13px] font-semibold">{t("bug.variant", { n: i + 1 })}</span>
                  {state === "correct" && <Check size={16} className="ml-auto text-success" strokeWidth={3} />}
                  {state === "wrong" && <X size={16} className="ml-auto text-error" strokeWidth={3} />}
                  {revealed && g.reveal?.stats && <span className="ml-auto rounded-full bg-surface-2 px-2 text-[11px] font-bold tabular text-muted">{g.reveal.stats[i] ?? 0}</span>}
                  {!revealed && state === "idle" && <Kbd>{i + 1}</Kbd>}
                </div>
                <CodeBlock code={v} lang={task.language} />
              </motion.button>
            );
          })}
        </div>
      )}

      <AnimatePresence>
        {!revealed && picked !== null && (
          <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-center gap-2 text-center font-semibold">
            <span className="flex size-7 items-center justify-center rounded-full bg-accent text-white">
              <Check size={16} strokeWidth={3} />
            </span>
            {t("game.accepted")} · <span className="font-normal text-muted">{t("game.acceptedHint")}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {revealed && <Explanation text={g.reveal?.explanation} />}
      {revealed && (
        <div>
          <SectionTitle>{t("game.top")}</SectionTitle>
          <Leaderboard rows={g.leaders} limit={5} meId={meId} compact />
        </div>
      )}
    </div>
  );
}

function ResultBanner({ correct, points, answered, place }: { correct: boolean; points: number; answered: boolean; place: number }) {
  const t = useT();
  const color = correct ? "var(--ca-success)" : answered ? "var(--ca-error)" : "var(--ca-warning)";
  const Icon = correct ? Check : answered ? X : Clock;
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={correct ? { scale: [0.92, 1.04, 1], opacity: 1 } : { scale: 1, opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-4 rounded-card p-4 text-white"
      style={{ background: color }}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Icon size={24} strokeWidth={3} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[20px] font-bold leading-tight">{correct ? t("game.correct") : answered ? t("game.wrong") : t("game.timeout")}</div>
        {place > 0 && <div className="text-[13px] opacity-90">{t("game.place", { n: place })}</div>}
      </div>
      {correct && <div className="text-[24px] font-bold tabular">+{points}</div>}
    </motion.div>
  );
}

function Explanation({ text }: { text?: string }) {
  const t = useT();
  if (!text) return null;
  return (
    <Card className="p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("bug.why")}</div>
      <p className="mt-1 text-[14px]">
        <CodeAwareText text={text} />
      </p>
    </Card>
  );
}

/* ───────────────────────── Исправь баг ───────────────────────── */

function FixBody({ g, task, meId }: { g: GameSnapshot; task: FixTask; meId?: string }) {
  const t = useT();
  const now = useNow(250);
  const left = secondsLeft(g, now);
  const revealed = g.phase === "reveal";
  const run = g.localRun?.taskId === task.id ? g.localRun : null;
  const solved = !!g.result?.correct;
  const results = run?.results ?? [];
  const failed = results.filter((r) => !r.ok).length;
  const rulesMode = task.language === "html" || task.language === "css";
  const checks = rulesMode ? task.rules.map((r) => ({ call: r.label, expected: "" })) : task.tests;

  const was = useRef(solved);
  useEffect(() => {
    if (solved && !was.current) play("correct");
    was.current = solved;
  }, [solved]);

  return (
    <div className="flex flex-col gap-4">
      <TaskHead g={g} task={task} left={left} total={(g.limitMs ?? 120000) / 1000} />
      {revealed && <ResultBanner correct={solved} points={g.result?.points ?? 0} answered={!!run} place={meId ? g.leaders.findIndex((l) => l.id === meId) + 1 : 0} />}

      <Card className="flex items-start gap-3 p-4">
        <Wrench size={18} className="mt-0.5 shrink-0 text-warning" />
        <p className="whitespace-pre-wrap text-[15px] font-semibold leading-snug">
          <CodeAwareText text={task.prompt} />
        </p>
      </Card>

      {!revealed && (
        <AnimatePresence mode="wait">
          {solved ? (
            <motion.div key="ok" initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: [0.92, 1.04, 1], opacity: 1 }} className="flex items-center gap-3 rounded-card bg-success p-4 text-white">
              <Check size={24} strokeWidth={3} />
              <div>
                <div className="text-[18px] font-bold">{t("bug.fixed", { n: g.result?.points ?? 0 })}</div>
                <div className="text-[13px] opacity-90">{t("bug.fixedHint")}</div>
              </div>
            </motion.div>
          ) : noRuntime(run?.error) ? (
            <NoPython key="nopy" dart={run?.error === "no_dart"} />
          ) : run?.error === "timeout" || run?.error === "compile" ? (
            <Card key="err" className="flex items-start gap-3 border-error/40 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error" />
              <div className="min-w-0">
                <div className="font-semibold">{run.error === "timeout" ? t("cw.timeout") : t("cw.compile")}</div>
                {run.message && <pre className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-muted">{run.message}</pre>}
              </div>
            </Card>
          ) : results.length > 0 && !run?.running ? (
            <motion.div key={`r${failed}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn("rounded-btn px-3 py-2 text-[13px] font-semibold", failed ? "bg-error/12 text-error" : "bg-success/12 text-success")}>
              {failed ? t("cw.failed", { n: failed, total: results.length }) : t("cw.passedLocal")}
            </motion.div>
          ) : null}
        </AnimatePresence>
      )}

      <div>
        <SectionTitle>{t("bug.rules")}</SectionTitle>
        <ol className="flex flex-col gap-1.5">
          {checks.map((c, i) => (
            <TestRow key={i} call={c.call} expected={c.expected} result={results[i]} running={!!run?.running} />
          ))}
        </ol>
      </div>

      {revealed ? (
        <>
          <div className="text-[13px] text-muted">{t("bug.fixedCount", { n: g.reveal?.stats?.[0] ?? 0 })}</div>
          <Explanation text={g.reveal?.explanation} />
        </>
      ) : (
        !solved && (
          <div className="flex flex-col gap-2">
            <Button variant="primary" size="lg" block icon={<Send size={18} />} loading={!!run?.running && run.submitted} disabled={g.phase !== "playing" || !!run?.running} onClick={() => host.post({ type: "submit_code" })}>
              {t("cw.submit")}
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button icon={<Play size={14} />} loading={!!run?.running && !run.submitted} disabled={g.phase !== "playing" || !!run?.running} onClick={() => host.post({ type: "run_tests" })}>
                {t("cw.run")}
              </Button>
              <Button icon={<FileCode2 size={14} />} onClick={() => host.post({ type: "open_task_file" })}>
                {t("cw.openFile")}
              </Button>
            </div>
            <p className="text-center text-[12px] text-muted">
              {t("cw.writeInEditor")} · <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd>
            </p>
          </div>
        )
      )}
    </div>
  );
}
