import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, ChevronRight, CircleDashed, Clock, Eye, Flag, Pause, Play, RotateCcw, SkipForward, Square, Users, X, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameSnapshot, SessionSnapshot, Task } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card, SectionTitle } from "../../ui/Card.tsx";
import { TimerRing } from "../../ui/Controls.tsx";
import { Countdown, Leaderboard, Podium, QuestionView, SoundToggle, TeamScores, type TileState } from "../../ui/Game.tsx";
import { StatusDot } from "../../ui/Status.tsx";
import { Rope } from "../../ui/Rope.tsx";
import { teamColor } from "../../ui/Avatar.tsx";
import { TeamIcon } from "../../ui/Shapes.tsx";
import { formatClock } from "../StudentTug.tsx";
import { SolutionsList } from "../StudentCodewars.tsx";
import { CodeBlock } from "../../ui/Code.tsx";
import { Avatar } from "../../ui/Avatar.tsx";
import { cn } from "../../lib/cn.ts";
import { celebrate, play, secondsLeft, useNow } from "../../lib/game.ts";
import { prettyCode, useT } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";

/** Экран учителя во время игры: та же картинка, что у учеников, плюс управление. */
export function TeacherGame({ session, tasks, onAgain }: { session: SessionSnapshot; tasks: Task[]; onAgain: () => void }) {
  const g = session.game!;
  const teamNames = session.lobby?.teams.map((x) => x.name) ?? [];
  if (g.phase === "over") return <TeacherResults g={g} teamNames={teamNames} onAgain={onAgain} />;
  if (g.kind === "tug") return <TeacherTug session={session} g={g} tasks={tasks} teamNames={teamNames} />;
  if (g.kind === "codewars") return <TeacherCodewars session={session} g={g} teamNames={teamNames} />;
  return <TeacherRound session={session} g={g} tasks={tasks} teamNames={teamNames} />;
}

function TeacherRound({ session, g, tasks, teamNames }: { session: SessionSnapshot; g: GameSnapshot; tasks: Task[]; teamNames: string[] }) {
  const t = useT();
  const now = useNow();
  const left = secondsLeft(g, now);
  const paused = g.phase === "paused";
  const task = g.task;
  // Полное задание с правильным ответом есть только у учителя.
  const full = tasks[g.index] as Extract<Task, { type: "choice" }> | undefined;
  const revealed = g.phase === "reveal";
  const correct = revealed ? (g.reveal?.answer as number) : -1;
  const lastPlace = g.index + 1 >= g.count;

  // Этап сменился (например, все ответили и ответ показался сам) — кнопку
  // ненадолго блокируем, чтобы случайный клик не пролистнул показ ответа.
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    setCooling(true);
    const id = setTimeout(() => setCooling(false), 900);
    return () => clearTimeout(id);
  }, [g.phase, g.index]);

  // Последние 5 секунд — тиканье.
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
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent">{t("game.quiz")}</span>
          {g.index >= 0 && <span className="font-medium tabular">{t("game.question", { n: g.index + 1, total: g.count })}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted tabular">{prettyCode(session.code ?? "")}</span>
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-6 py-5">
        {g.phase === "countdown" || (paused && g.index < 0) ? (
          <Countdown left={left} title={t("game.quiz")} />
        ) : task && task.type === "choice" ? (
          <div className="grid items-start gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,340px),1fr))]">
            <div className="flex flex-col gap-4 [grid-column:span_2/span_2] max-[900px]:[grid-column:auto]">
              <div className="flex items-center justify-between gap-4">
                <AnsweredBar n={g.answered} total={g.total} />
                {!revealed && <TimerRing left={left} total={(g.limitMs ?? 20000) / 1000} size={72} />}
              </div>
              <QuestionView
                big
                prompt={task.prompt}
                options={task.options}
                states={task.options.map((_, i): TileState => (revealed ? (i === correct ? "correct" : "dim") : "idle"))}
                stats={revealed ? g.reveal?.stats : undefined}
              />
              <AnimatePresence>
                {revealed && (g.reveal?.explanation || full?.explanation) && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                    <Card className="p-4">
                      <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("game.why")}</div>
                      <p className="mt-1 text-[14px]">{g.reveal?.explanation ?? full?.explanation}</p>
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

        <AnimatePresence>
          {paused && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-[2px]">
              <Card className="flex flex-col items-center gap-3 px-10 py-8 text-center">
                <Pause size={28} className="text-warning" />
                <div className="text-title font-bold">{t("game.paused")}</div>
                <Button variant="primary" size="lg" icon={<Play size={18} />} onClick={() => host.send({ type: "resume" })}>
                  {t("game.resume")}
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
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

function AnsweredBar({ n, total, label }: { n: number; total: number; label?: string }) {
  const t = useT();
  const pct = total > 0 ? Math.min(100, (n / total) * 100) : 0;
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-[13px] text-muted">
        <Users size={14} />
        <span className="tabular">{label ?? t("game.answered", { n, total })}</span>
      </div>
      <div className="h-2 w-full max-w-[360px] overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 200, damping: 26 }} />
      </div>
    </div>
  );
}

function TeacherResults({ g, teamNames, onAgain }: { g: GameSnapshot; teamNames: string[]; onAgain: () => void }) {
  const t = useT();
  useEffect(() => {
    celebrate();
    play("win");
  }, []);
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-6 px-6 py-6">
        <h1 className="text-center text-[28px] font-bold">{t("game.results")}</h1>
        {g.kind === "tug" && <WinnerBanner winner={g.winner} names={teamNames} />}
        <Podium rows={g.leaders} />
        {g.teamScores.length > 0 && (
          <Card className="p-4">
            <SectionTitle>{t("game.teams")}</SectionTitle>
            <TeamScores scores={g.teamScores} names={teamNames} />
          </Card>
        )}
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
            <span>{t("game.top")}</span>
            {g.kind === "tug" ? (
              <span>{t("tug.pullsTitle")}</span>
            ) : (
              <span className="flex gap-6">
                <span>{t("game.correctCount")}</span>
                <span>{t("game.score")}</span>
              </span>
            )}
          </div>
          <ol className="flex flex-col">
            {g.leaders.map((r, i) => (
              <li key={r.id} className="flex h-10 items-center gap-3 border-b border-border last:border-0">
                <span className="w-6 text-center font-bold tabular text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{r.name}</span>
                {g.kind !== "tug" && <span className="w-16 text-right tabular text-muted">{r.progress}/{g.count}</span>}
                <span className="w-16 text-right font-bold tabular">{r.score}</span>
              </li>
            ))}
          </ol>
        </Card>
      </div>
      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-end gap-3 px-6 py-3">
          <Button icon={<RotateCcw size={14} />} onClick={onAgain}>
            {t("game.again")}
          </Button>
          <Button variant="primary" size="lg" onClick={() => host.send({ type: "reset_game" })}>
            {t("game.newGame")}
          </Button>
        </div>
      </footer>
    </div>
  );
}

/* ───────────────────────── Канат ───────────────────────── */

function TeacherTug({ session, g, tasks, teamNames }: { session: SessionSnapshot; g: GameSnapshot; tasks: Task[]; teamNames: string[] }) {
  const t = useT();
  const now = useNow();
  const left = secondsLeft(g, now);
  const paused = g.phase === "paused";
  const full = tasks[g.index];
  const answer = full?.type === "short_answer" ? full.answers.join(" / ") : "";
  const pull = g.lastPull;
  const names = [teamNames[0] ?? "", teamNames[1] ?? ""] as [string, string];

  // Рывок — звук, последние 10 секунд — тиканье.
  useEffect(() => {
    if (pull) play("correct");
  }, [pull?.at]);
  const lastTick = useRef(0);
  useEffect(() => {
    const s = Math.ceil(left);
    if (g.phase === "playing" && s <= 10 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      play("tick");
    }
  }, [left, g.phase]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <span className="rounded-full bg-[color-mix(in_srgb,var(--ca-team-0)_15%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ca-team-0)]">{t("game.tug")}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted tabular">{prettyCode(session.code ?? "")}</span>
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-6 px-6 py-6">
        {g.phase === "countdown" || (paused && g.index < 0) ? (
          <Countdown left={left} title={t("game.tug")} />
        ) : (
          <>
            <div className="flex items-center justify-center gap-3">
              <span className="text-[12px] text-muted">{t("tug.timeLeft")}</span>
              <span className={cn("font-mono text-[44px] font-bold leading-none tabular", left <= 10 && "text-warning")}>{formatClock(left)}</span>
            </div>
            <Rope position={g.rope} names={names} scores={g.teamScores as [number, number]} pullKey={pull?.at ?? null} pullTeam={pull?.team ?? null} />
            <div className="h-7 text-center">
              <AnimatePresence mode="wait">
                {pull && now - pull.at < 2500 && (
                  <motion.div key={pull.at} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="inline-flex items-center gap-1.5 text-[16px] font-bold" style={{ color: teamColor(pull.team) }}>
                    <Zap size={16} /> {t("tug.pulled", { name: pull.name, team: names[pull.team] ?? "" })}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            {g.task?.type === "short_answer" && (
              <Card className="flex flex-col items-center gap-2 px-6 py-6 text-center">
                <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("tug.task", { n: g.index + 1 })}</span>
                <AnimatePresence mode="popLayout">
                  <motion.div key={g.task.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="whitespace-pre-wrap font-mono text-[34px] font-bold leading-tight">
                    {g.task.prompt}
                  </motion.div>
                </AnimatePresence>
                {answer && <span className="text-[12px] text-muted">{t("tug.answer", { a: answer })}</span>}
              </Card>
            )}
            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,280px),1fr))]">
              {[0, 1].map((team) => (
                <Card key={team} className="p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="flex size-6 items-center justify-center rounded-full text-white" style={{ background: teamColor(team) }}>
                      <TeamIcon team={team} size={12} />
                    </span>
                    <span className="font-semibold">{names[team]}</span>
                    <span className="ml-auto text-[12px] text-muted tabular">{t.count("tug.pulls", g.teamScores[team] ?? 0)}</span>
                  </div>
                  <Leaderboard rows={g.leaders.filter((l) => l.team === team)} limit={5} compact />
                </Card>
              ))}
            </div>
          </>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" icon={<Square size={14} />} onClick={() => host.send({ type: "end_game" })}>
              {t("game.end")}
            </Button>
            <Button icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => host.send({ type: paused ? "resume" : "pause" })}>
              {paused ? t("game.resume") : t("game.pause")}
            </Button>
          </div>
          <Button variant="primary" size="lg" icon={<SkipForward size={18} />} onClick={() => host.send({ type: "next" })} disabled={paused}>
            {g.phase === "countdown" ? t("game.next") : t("tug.skip")}
          </Button>
        </div>
      </footer>
    </div>
  );
}

function WinnerBanner({ winner, names }: { winner: number | null; names: string[] }) {
  const t = useT();
  const color = winner === null ? "var(--ca-accent)" : teamColor(winner);
  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="flex items-center justify-center gap-3 rounded-card px-6 py-5 text-white"
      style={{ background: color }}
    >
      {winner !== null && (
        <span className="flex size-10 items-center justify-center rounded-full bg-white/20">
          <TeamIcon team={winner} size={20} />
        </span>
      )}
      <span className="text-[26px] font-bold">{winner === null ? t("tug.draw") : t("tug.wins", { team: names[winner] ?? "" })}</span>
    </motion.div>
  );
}

export { WinnerBanner };

/* ───────────────────────── Codewars ───────────────────────── */

function TeacherCodewars({ session, g, teamNames }: { session: SessionSnapshot; g: GameSnapshot; teamNames: string[] }) {
  const t = useT();
  const now = useNow(250);
  const left = secondsLeft(g, now);
  const paused = g.phase === "paused";
  const revealed = g.phase === "reveal";
  const task = g.task?.type === "code" ? g.task : null;
  const players = session.lobby?.players ?? [];
  const solved = Object.values(g.submissions).filter((x) => x.correct).length;
  const [open, setOpen] = useState<string | null>(null);
  const lastPlace = g.index + 1 >= g.count;
  // Решения могли показаться сами (все решили) — короткая блокировка от случайного клика.
  const [cooling, setCooling] = useState(false);
  useEffect(() => {
    setCooling(true);
    const id = setTimeout(() => setCooling(false), 900);
    return () => clearTimeout(id);
  }, [g.phase, g.index]);

  // Место среди решивших: короче выше, при равной длине — раньше (как на сервере).
  const ranked = Object.entries(g.submissions)
    .filter(([, x]) => x.correct && x.code)
    .map(([id, x]) => ({ id, len: x.code!.replace(/\s+/g, "").length, at: x.at }))
    .sort((a, b) => a.len - b.len || a.at - b.at);
  const placeOf = (id: string) => ranked.findIndex((r) => r.id === id) + 1;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[color-mix(in_srgb,var(--ca-team-1)_15%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ca-team-1)]">Codewars</span>
          {g.index >= 0 && <span className="font-medium tabular">{t("tug.task", { n: g.index + 1 })} / {g.count}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted tabular">{prettyCode(session.code ?? "")}</span>
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-6 py-5">
        {g.phase === "countdown" || (paused && g.index < 0) ? (
          <Countdown left={left} title="Codewars" />
        ) : task ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <AnsweredBar n={solved} total={g.total} label={t("cw.solvedCount", { n: solved, total: g.total })} />
              {!revealed && (
                <span className={cn("inline-flex items-center gap-2 font-mono text-[36px] font-bold leading-none tabular", left <= 30 && "text-warning")}>
                  <Clock size={22} className="text-muted" />
                  {formatClock(left)}
                </span>
              )}
            </div>
            <Card className="p-5">
              <span className="rounded-[6px] bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] font-semibold uppercase text-muted">{task.language === "python" ? "Python" : "JavaScript"}</span>
              <p className="mt-2 whitespace-pre-wrap text-[18px] font-semibold">{task.prompt}</p>
            </Card>

            {revealed ? (
              <SolutionsList solutions={g.reveal?.solutions ?? []} lang={task.language} />
            ) : (
              <Card className="p-2">
                <ul className="flex flex-col">
                  {players.map((p) => {
                    const sub = g.submissions[p.id];
                    const status = sub ? (sub.correct ? "solved" : "wrong") : "thinking";
                    const isOpen = open === p.id && !!sub?.code;
                    return (
                      <li key={p.id} className="border-b border-border last:border-0">
                        <button
                          onClick={() => setOpen(isOpen ? null : p.id)}
                          disabled={!sub?.code}
                          className="flex h-11 w-full items-center gap-3 rounded-[8px] px-2 text-left transition-colors enabled:hover:bg-hover"
                        >
                          <Avatar name={p.name} team={p.team} size={26} offline={!p.connected} />
                          <span className="min-w-0 flex-1 truncate font-medium">{p.name}</span>
                          {sub && sub.attempts > 1 && <span className="text-[12px] text-muted">{t("cw.attempts", { n: sub.attempts })}</span>}
                          {status === "solved" && sub?.code && (
                            <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold tabular text-muted">{t("cw.chars", { n: sub.code.replace(/\s+/g, "").length })}</span>
                          )}
                          <span
                            className={cn(
                              "inline-flex w-[92px] items-center justify-end gap-1 text-[12px] font-semibold",
                              status === "solved" ? "text-success" : status === "wrong" ? "text-error" : "text-muted",
                            )}
                          >
                            {status === "solved" ? <Check size={13} strokeWidth={3} /> : status === "wrong" ? <X size={13} strokeWidth={3} /> : <CircleDashed size={13} />}
                            {status === "solved" ? `#${placeOf(p.id)}` : t(`cw.status.${status}` as "cw.status.thinking")}
                          </span>
                          {sub?.code ? <ChevronDown size={14} className={cn("text-muted transition-transform", isOpen && "rotate-180")} /> : <span className="w-[14px]" />}
                        </button>
                        <AnimatePresence>
                          {isOpen && sub?.code && (
                            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden px-2 pb-3">
                              {sub.report && sub.report.failures.length > 0 && (
                                <ul className="mb-2 flex flex-col gap-1 font-mono text-[12px] text-error">
                                  {sub.report.failures.slice(0, 5).map((f, i) => (
                                    <li key={i}>
                                      ✗ {f.name} → {f.expected} · {t("cw.got")}: {f.got}
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <CodeBlock code={sub.code} lang={task.language} lineNumbers />
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            )}
            {g.teamScores.length > 0 && (
              <Card className="p-4">
                <SectionTitle>{t("game.teams")}</SectionTitle>
                <TeamScores scores={g.teamScores} names={teamNames} />
              </Card>
            )}
          </>
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
            {revealed ? (lastPlace ? t("game.finish") : t("game.next")) : g.phase === "countdown" ? t("game.next") : t("cw.showSolutions")}
          </Button>
        </div>
      </footer>
    </div>
  );
}
