import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, Check, CircleDashed, Clock, ExternalLink, FileCode2, Play, Send, Trophy, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GameSnapshot, SessionSnapshot, SolutionView, TestResult } from "@codearena/shared";
import { Button, Spinner } from "../ui/Button.tsx";
import { Card, Kbd, SectionTitle } from "../ui/Card.tsx";
import { CodeBlock } from "../ui/Code.tsx";
import { Avatar } from "../ui/Avatar.tsx";
import { CodeAwareText } from "../ui/Game.tsx";
import { ExternalA } from "../ui/ExternalA.tsx";
import { cn } from "../lib/cn.ts";
import { play, secondsLeft, useNow } from "../lib/game.ts";
import { useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";
import { formatClock } from "./StudentTug.tsx";

export const LANG_LABEL: Record<string, string> = { html: "HTML", css: "CSS", javascript: "JavaScript", python: "Python", dart: "Dart" };

type CodeTask = Extract<NonNullable<GameSnapshot["task"]>, { type: "code" }>;

/** Codewars у ученика: панель рядом с файлом задачи. */
export function StudentCodewarsBody({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const t = useT();
  const now = useNow(250);
  const task = g.task?.type === "code" ? (g.task as CodeTask) : null;
  if (!task) return null;
  const meId = session.me?.playerId;
  if (g.phase === "reveal") return <CodewarsReveal g={g} task={task} meId={meId} />;

  const left = secondsLeft(g, now);
  const run = g.localRun?.taskId === task.id ? g.localRun : null;
  const solved = !!g.result?.correct;
  const results = run?.results ?? [];
  const failed = results.filter((r) => !r.ok).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-muted tabular">{t("tug.task", { n: g.index + 1 })} / {g.count}</span>
        <span className={cn("inline-flex items-center gap-1.5 font-mono text-[22px] font-bold tabular", left <= 30 && "text-warning")}>
          <Clock size={16} className="text-muted" />
          {formatClock(left)}
        </span>
      </div>

      <Card className="p-4">
        <div className="mb-1 flex items-center gap-2">
          <span className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted">{LANG_LABEL[task.language] ?? task.language}</span>
        </div>
        <p className="whitespace-pre-wrap text-[15px] font-semibold leading-snug">
          <CodeAwareText text={task.prompt} />
        </p>
      </Card>

      <AnimatePresence mode="wait">
        {solved ? (
          <SolvedCard key="solved" place={g.result?.place ?? null} />
        ) : noRuntime(run?.error) ? (
          <NoPython key="nopy" dart={run?.error === "no_dart"} />
        ) : run?.error === "timeout" || run?.error === "compile" ? (
          <motion.div key="err" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <Card className="flex items-start gap-3 border-error/40 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-error" />
              <div className="min-w-0">
                <div className="font-semibold">{run.error === "timeout" ? t("cw.timeout") : t("cw.compile")}</div>
                {run.message && <pre className="mt-1 whitespace-pre-wrap font-mono text-[12px] text-muted">{run.message}</pre>}
              </div>
            </Card>
          </motion.div>
        ) : results.length > 0 && !run?.running ? (
          <motion.div key={`res-${failed}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
            <div className={cn("rounded-btn px-3 py-2 text-[13px] font-semibold", failed ? "bg-error/12 text-error" : "bg-success/12 text-success")}>
              {failed ? t("cw.failed", { n: failed, total: results.length }) : t("cw.passedLocal")}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div>
        <SectionTitle>{t("cw.tests")}</SectionTitle>
        <ol className="flex flex-col gap-1.5">
          {task.tests.map((test, i) => (
            <TestRow key={i} call={test.call} expected={test.expected} result={results[i]} running={!!run?.running} />
          ))}
        </ol>
      </div>

      {!solved && (
        <div className="flex flex-col gap-2">
          <Button
            variant="primary"
            size="lg"
            block
            icon={<Send size={18} />}
            loading={!!run?.running && run.submitted}
            disabled={g.phase !== "playing" || !!run?.running}
            onClick={() => host.post({ type: "submit_code" })}
          >
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
      )}
    </div>
  );
}

export function TestRow({ call, expected, result, running }: { call: string; expected: string; result?: TestResult; running: boolean }) {
  const t = useT();
  const state = running ? "running" : !result ? "idle" : result.ok ? "ok" : "fail";
  return (
    <li
      className={cn(
        "flex items-start gap-2.5 rounded-[10px] border px-3 py-2 font-mono text-[12.5px]",
        state === "ok" ? "border-success/40 bg-success/8" : state === "fail" ? "border-error/40 bg-error/8" : "border-border bg-surface",
      )}
    >
      <span className="mt-0.5 shrink-0">
        {state === "running" ? (
          <Spinner className="size-3.5 text-muted" />
        ) : state === "ok" ? (
          <Check size={14} className="text-success" strokeWidth={3} />
        ) : state === "fail" ? (
          <X size={14} className="text-error" strokeWidth={3} />
        ) : (
          <CircleDashed size={14} className="text-muted" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        {/* Правило HTML/CSS — только описание; тест — «вызов → ожидается». */}
        <div className={cn("break-all", expected === "" && "font-sans")}>
          {call}
          {expected !== "" && (
            <>
              {" "}
              <span className="text-muted">→</span> {expected}
            </>
          )}
        </div>
        {state === "fail" && result?.got !== undefined && (
          <div className="mt-0.5 break-all text-error">
            {t("cw.got")}: {result.got}
          </div>
        )}
      </div>
    </li>
  );
}

function SolvedCard({ place }: { place: number | null }) {
  const t = useT();
  useEffect(() => { play("correct"); }, []);
  return (
    <motion.div
      initial={{ scale: 0.92, opacity: 0 }}
      animate={{ scale: [0.92, 1.04, 1], opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-3 rounded-card bg-success p-4 text-white"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Trophy size={22} />
      </span>
      <div>
        <div className="text-[18px] font-bold">{t("cw.solved", { n: place ?? "?" })}</div>
        <div className="text-[13px] opacity-90">{t("cw.solvedHint")}</div>
      </div>
    </motion.div>
  );
}

/** Нет интерпретатора у ученика: Python или Dart (error no_python / no_dart). */
export const noRuntime = (e: string | null | undefined) => e === "no_python" || e === "no_dart";

export function NoPython({ dart = false }: { dart?: boolean }) {
  const t = useT();
  return (
    <Card className="flex items-start gap-3 border-warning/50 p-4">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-warning" />
      <div>
        <div className="font-semibold">{t(dart ? "cw.noDart" : "cw.noPython")}</div>
        <p className="mt-0.5 text-muted">{t(dart ? "cw.noDartHint" : "cw.noPythonHint")}</p>
        <ExternalA
          href={dart ? "https://dart.dev/get-dart" : "https://www.python.org/downloads/"}
          className="mt-2 inline-flex items-center gap-1.5 rounded-btn bg-accent px-3 py-1.5 text-[13px] font-semibold text-white no-underline hover:bg-accent-hover"
        >
          {t("cw.howInstall")} <ExternalLink size={13} />
        </ExternalA>
      </div>
    </Card>
  );
}

/** Показ после раунда: все правильные решения с кодом, как в Codewars. */
function CodewarsReveal({ g, task, meId }: { g: GameSnapshot; task: CodeTask; meId?: string }) {
  const t = useT();
  const solutions = g.reveal?.solutions ?? [];
  const lastResult = useRef(g.result);
  useEffect(() => {
    if (g.result && g.result !== lastResult.current && !g.result.correct) play("wrong");
    lastResult.current = g.result;
  }, [g.result]);
  return (
    <div className="flex flex-col gap-4">
      {g.result?.correct && g.result.place ? (
        <div className="flex items-center gap-3 rounded-card bg-success p-4 text-white">
          <Trophy size={22} />
          <span className="text-[18px] font-bold">{t("game.place", { n: g.result.place })}</span>
          <span className="ml-auto text-[20px] font-bold tabular">+{g.result.points}</span>
        </div>
      ) : (
        <div className="rounded-card bg-surface-2 p-4 font-semibold">{t("game.timeout")}</div>
      )}
      <p className="text-[14px] text-muted">
        <CodeAwareText text={task.prompt} />
      </p>
      <SolutionsList solutions={solutions} lang={task.language} meId={meId} />
    </div>
  );
}

export function SolutionsList({ solutions, lang, meId }: { solutions: SolutionView[]; lang: string; meId?: string }) {
  const t = useT();
  if (solutions.length === 0) return <Card className="p-6 text-center text-muted">{t("cw.noSolutions")}</Card>;
  return (
    <div>
      <SectionTitle>{t("cw.solutions")}</SectionTitle>
      <ol className="flex flex-col gap-3">
        {solutions.map((s, i) => (
          <motion.li
            key={s.playerId}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.06 }}
            className={cn("rounded-card border p-3", s.playerId === meId ? "border-accent bg-accent/8" : "border-border bg-surface")}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className={cn("w-6 text-center font-bold tabular", i < 3 ? "text-fg" : "text-muted")}>{i + 1}</span>
              <Avatar name={s.name} size={24} />
              <span className="min-w-0 flex-1 truncate font-semibold">{s.name}</span>
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular text-muted">{t("cw.chars", { n: s.length })}</span>
            </div>
            <CodeBlock code={s.code} lang={lang} />
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
