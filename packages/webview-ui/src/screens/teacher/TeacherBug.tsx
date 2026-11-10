import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronRight, Eye, Flag, Pause, Play, Square, Users, Wrench } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OPTION_SHAPES, type GameSnapshot, type SessionSnapshot } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card, SectionTitle } from "../../ui/Card.tsx";
import { ClickableCode, CodeBlock } from "../../ui/Code.tsx";
import { TimerRing } from "../../ui/Controls.tsx";
import { CodeAwareText, Countdown, Leaderboard, SoundToggle, TeamScores } from "../../ui/Game.tsx";
import { Shape } from "../../ui/Shapes.tsx";
import { StatusDot } from "../../ui/Status.tsx";
import { cn } from "../../lib/cn.ts";
import { play, secondsLeft, useNow } from "../../lib/game.ts";
import { prettyCode, useT } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { formatClock } from "../StudentTug.tsx";
import { bugKindKey } from "../StudentBug.tsx";
import { SubmissionsTable } from "./TeacherGame.tsx";

const LANG: Record<string, string> = { html: "HTML", css: "CSS", javascript: "JavaScript", python: "Python", dart: "Dart" };

/** «Найди баг» у учителя: та же картинка, что у учеников, плюс статистика и управление. */
export function TeacherBug({ session, g, teamNames }: { session: SessionSnapshot; g: GameSnapshot; teamNames: string[] }) {
  const t = useT();
  const now = useNow(200);
  const left = secondsLeft(g, now);
  const paused = g.phase === "paused";
  const revealed = g.phase === "reveal";
  const task = g.task;
  const lastPlace = g.index + 1 >= g.count;
  const isFix = task?.type === "fix_bug";
  const solved = Object.values(g.submissions).filter((x) => x.correct).length;
  const total = (g.limitMs ?? 20000) / 1000;

  // Ответ мог показаться сам (все ответили) — короткая блокировка от случайного клика.
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    setCooling(true);
    const id = setTimeout(() => setCooling(false), 900);
    return () => clearTimeout(id);
  }, [g.phase, g.index]);

  const lastTick = useRef(0);
  useEffect(() => {
    const s = Math.ceil(left);
    if (g.phase === "playing" && s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      play("tick");
    }
  }, [left, g.phase]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-warning/15 px-2.5 py-1 text-[12px] font-semibold text-warning">{t("game.bug")}</span>
          {task && <span className="text-[13px] font-medium">{t(bugKindKey(task.type))}</span>}
          {g.index >= 0 && <span className="text-[13px] text-muted tabular">{g.index + 1} / {g.count}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted tabular">{prettyCode(session.code ?? "")}</span>
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-6 py-5">
        {g.phase === "countdown" || (paused && g.index < 0) ? (
          <Countdown left={left} title={t("game.bug")} />
        ) : task ? (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
            <div className="flex flex-col gap-4 [grid-column:span_2/span_2] max-[900px]:[grid-column:auto]">
              <div className="flex items-center justify-between gap-4">
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-center gap-1.5 text-[13px] text-muted">
                    <Users size={14} />
                    <span className="tabular">{isFix ? t("bug.fixedCount", { n: solved }) + ` / ${g.total}` : t("game.answered", { n: g.answered, total: g.total })}</span>
                  </div>
                  <div className="h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-surface-2">
                    <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${g.total ? Math.min(100, ((isFix ? solved : g.answered) / g.total) * 100) : 0}%` }} />
                  </div>
                </div>
                {!revealed &&
                  (total > 90 ? (
                    <span className={cn("font-mono text-[32px] font-bold tabular", left <= 30 && "text-warning")}>{formatClock(left)}</span>
                  ) : (
                    <TimerRing left={left} total={total} size={68} />
                  ))}
              </div>

              <div className="flex items-center gap-2">
                {"language" in task && <span className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted">{LANG[task.language]}</span>}
                <h2 className="text-[20px] font-bold leading-snug">
                  <CodeAwareText text={task.prompt} />
                </h2>
              </div>

              {task.type === "find_line" && (
                <ClickableCode code={task.code} lang={task.language} correct={revealed ? (g.reveal?.answer as number) : null} stats={revealed ? g.reveal?.stats : undefined} />
              )}

              {task.type === "best_variant" && (
                <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
                  {task.variants.map((v, i) => {
                    const correct = revealed && i === (g.reveal?.answer as number);
                    return (
                      <div key={i} className={cn("flex flex-col gap-2 rounded-card border-2 bg-surface p-3 transition-opacity", correct ? "border-success" : "border-border", revealed && !correct && "opacity-50")}>
                        <div className="flex items-center gap-2">
                          <span className="flex size-7 items-center justify-center rounded-[8px] text-white" style={{ background: `var(--ca-opt-${i})` }}>
                            <Shape shape={OPTION_SHAPES[i]!} size={12} />
                          </span>
                          <span className="text-[13px] font-semibold">{t("bug.variant", { n: i + 1 })}</span>
                          {correct && <Check size={16} className="text-success" strokeWidth={3} />}
                          {revealed && <span className="ml-auto rounded-full bg-surface-2 px-2 text-[11px] font-bold tabular text-muted">{g.reveal?.stats?.[i] ?? 0}</span>}
                        </div>
                        <CodeBlock code={v} lang={task.language} />
                      </div>
                    );
                  })}
                </div>
              )}

              {task.type === "fix_bug" && (
                <>
                  <CodeBlock code={task.code} lang={task.language} lineNumbers />
                  <Card className="p-3">
                    <SectionTitle>{t("bug.rules")}</SectionTitle>
                    <ul className="flex flex-col gap-1 text-[13px]">
                      {(task.language === "html" || task.language === "css" ? task.rules.map((r) => r.label) : task.tests.map((x) => `${x.call} → ${x.expected}`)).map((l, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <Wrench size={12} className="text-muted" /> <span className="font-mono">{l}</span>
                        </li>
                      ))}
                    </ul>
                  </Card>
                  {!revealed && <SubmissionsTable players={session.lobby?.players ?? []} submissions={g.submissions} lang={task.language} />}
                </>
              )}

              <AnimatePresence>
                {revealed && g.reveal?.explanation && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("bug.why")}</div>
                      <p className="mt-1 text-[14px]">
                        <CodeAwareText text={g.reveal.explanation} />
                      </p>
                    </Card>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <div className="flex flex-col gap-4">
              {g.teamScores.length > 0 && (
                <Card className="p-4">
                  <SectionTitle>{t("game.teams")}</SectionTitle>
                  <TeamScores scores={g.teamScores} names={teamNames} />
                </Card>
              )}
              <Card className="p-4">
                <SectionTitle>{t("game.top")}</SectionTitle>
                <Leaderboard rows={g.leaders} limit={8} compact />
              </Card>
            </div>
          </div>
        ) : null}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<Square size={14} />} onClick={() => host.send({ type: "end_game" })}>
              {t("game.end")}
            </Button>
            {!revealed && (
              <Button icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => host.send({ type: paused ? "resume" : "pause" })}>
                {paused ? t("game.resume") : t("game.pause")}
              </Button>
            )}
          </div>
          <Button
            variant="primary"
            size="lg"
            icon={revealed ? (lastPlace ? <Flag size={18} /> : <ChevronRight size={18} />) : <Eye size={18} />}
            onClick={() => host.send({ type: "next" })}
            disabled={paused || cooling}
          >
            {revealed ? (lastPlace ? t("game.finish") : t("game.next")) : g.phase === "countdown" ? t("game.next") : t("game.showAnswer")}
          </Button>
        </div>
      </footer>
    </div>
  );
}
