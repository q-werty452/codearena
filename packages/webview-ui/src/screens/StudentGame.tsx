import { AnimatePresence, motion } from "motion/react";
import { Check, Clock, Gamepad2, Pause, Trophy, X } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GameSnapshot, SessionSnapshot } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { Card } from "../ui/Card.tsx";
import { TimerRing } from "../ui/Controls.tsx";
import { Countdown, Leaderboard, Podium, QuestionView, SoundToggle, type TileState } from "../ui/Game.tsx";
import { StatusDot } from "../ui/Status.tsx";
import { celebrate, play, secondsLeft, useNow } from "../lib/game.ts";
import { useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";

/** Панель игры ученика (вкладка в области редактора). */
export function StudentGame({ session }: { session: SessionSnapshot }) {
  const t = useT();
  const g = session.game!;
  const meId = session.me?.playerId;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-2.5">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[12px] font-semibold text-accent">{t("game.quiz")}</span>
          {g.index >= 0 && g.phase !== "over" && <span className="text-[13px] text-muted tabular">{t("game.question", { n: g.index + 1, total: g.count })}</span>}
        </div>
        <div className="flex items-center gap-2">
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-[820px] flex-1 flex-col px-5 py-6">
        <Body g={g} meId={meId} />
      </div>
    </div>
  );
}

function Body({ g, meId }: { g: GameSnapshot; meId?: string }) {
  const t = useT();
  const now = useNow();
  const left = secondsLeft(g, now);

  if (g.phase === "over") return <StudentResults g={g} meId={meId} />;
  if (g.phase === "countdown" || (g.phase === "paused" && g.index < 0)) {
    return g.phase === "paused" ? <PausedCard /> : <Countdown left={left} title={t("game.quiz")} />;
  }
  if (g.phase === "paused") return <PausedCard />;
  if (!g.task || g.task.type !== "choice") return <Waiting />;
  if (g.phase === "reveal") return <Reveal g={g} meId={meId} />;
  return <Question g={g} left={left} />;
}

function Question({ g, left }: { g: GameSnapshot; left: number }) {
  const t = useT();
  const task = g.task as Extract<NonNullable<GameSnapshot["task"]>, { type: "choice" }>;
  const picked = typeof g.myAnswer === "number" ? g.myAnswer : null;
  const answer = (i: number) => {
    if (picked !== null || left <= 0) return;
    host.post({ type: "answer", taskId: task.id, answer: i });
  };

  // Клавиши 1–4 выбирают вариант.
  const answerRef = useRef(answer);
  answerRef.current = answer;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key);
      if (n >= 1 && n <= task.options.length && !e.ctrlKey && !e.metaKey && !e.altKey) answerRef.current(n - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [task.options.length]);

  // Последние 5 секунд — тиканье.
  const lastTick = useRef(0);
  useEffect(() => {
    const s = Math.ceil(left);
    if (picked === null && s <= 5 && s > 0 && s !== lastTick.current) {
      lastTick.current = s;
      play("tick");
    }
  }, [left, picked]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-center">
        <TimerRing left={left} total={(g.limitMs ?? 20000) / 1000} size={76} />
      </div>
      <QuestionView
        big
        prompt={task.prompt}
        options={task.options}
        states={task.options.map((_, i): TileState => (picked === null ? "idle" : i === picked ? "picked" : "dim"))}
        onPick={picked === null && left > 0 ? answer : undefined}
      />
      <AnimatePresence>
        {picked !== null && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center gap-1 text-center">
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 500, damping: 20 }}
              className="flex size-10 items-center justify-center rounded-full bg-accent text-white"
            >
              <Check size={22} strokeWidth={3} />
            </motion.span>
            <div className="text-[16px] font-bold">{t("game.accepted")}</div>
            <div className="text-muted">{t("game.acceptedHint")}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Reveal({ g, meId }: { g: GameSnapshot; meId?: string }) {
  const t = useT();
  const task = g.task as Extract<NonNullable<GameSnapshot["task"]>, { type: "choice" }>;
  const correct = g.reveal?.answer as number;
  const picked = typeof g.myAnswer === "number" ? g.myAnswer : null;
  const r = g.result;
  const ok = r?.correct ?? false;
  const place = meId ? g.leaders.findIndex((l) => l.id === meId) + 1 : 0;

  useEffect(() => {
    if (r) play(ok ? "correct" : "wrong");
  }, [r, ok]);

  const color = ok ? "var(--ca-success)" : picked === null ? "var(--ca-warning)" : "var(--ca-error)";
  const Icon = ok ? Check : picked === null ? Clock : X;
  const title = ok ? t("game.correct") : picked === null ? t("game.timeout") : t("game.wrong");

  return (
    <div className="flex flex-col gap-5">
      <motion.div
        initial={{ scale: 0.92, opacity: 0 }}
        animate={ok ? { scale: [0.92, 1.04, 1], opacity: 1 } : { scale: 1, opacity: 1, x: [0, -8, 8, -5, 5, 0] }}
        transition={{ duration: 0.4 }}
        className="flex items-center gap-4 rounded-card p-5 text-white"
        style={{ background: color }}
      >
        <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon size={28} strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[22px] font-bold leading-tight">{title}</div>
          {place > 0 && <div className="text-[14px] opacity-90">{t("game.place", { n: place })}</div>}
        </div>
        {ok && r && <div className="text-[26px] font-bold tabular">+{r.points}</div>}
      </motion.div>

      <QuestionView
        prompt={task.prompt}
        options={task.options}
        states={task.options.map((_, i): TileState => (i === correct ? "correct" : i === picked ? "wrong" : "dim"))}
      />

      {g.reveal?.explanation && (
        <Card className="p-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("game.why")}</div>
          <p className="mt-1 text-[14px]">{g.reveal.explanation}</p>
        </Card>
      )}

      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("game.top")}</div>
        <Leaderboard rows={g.leaders} limit={5} meId={meId} compact />
      </div>
    </div>
  );
}

function StudentResults({ g, meId }: { g: GameSnapshot; meId?: string }) {
  const t = useT();
  const idx = meId ? g.leaders.findIndex((l) => l.id === meId) : -1;
  const me = idx >= 0 ? g.leaders[idx] : undefined;
  useEffect(() => {
    celebrate();
    play("win");
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-center text-[26px] font-bold">{t("game.results")}</h1>
      <Podium rows={g.leaders} />
      {me && (
        <Card className="flex items-center gap-4 p-4">
          <span className="flex size-11 items-center justify-center rounded-full bg-accent text-white">
            <Trophy size={22} />
          </span>
          <div className="flex-1">
            <div className="text-[12px] text-muted">{t("game.yourPlace")}</div>
            <div className="text-[22px] font-bold tabular">
              {idx + 1} <span className="text-[14px] font-medium text-muted">/ {g.leaders.length}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[12px] text-muted">{t("game.score")}</div>
            <div className="text-[22px] font-bold tabular">{me.score}</div>
          </div>
        </Card>
      )}
      <Leaderboard rows={g.leaders} limit={10} meId={meId} compact />
    </div>
  );
}

function PausedCard() {
  const t = useT();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <motion.span
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.6, repeat: Infinity }}
        className="flex size-14 items-center justify-center rounded-full bg-warning/15 text-warning"
      >
        <Pause size={26} />
      </motion.span>
      <div className="text-title font-bold">{t("game.paused")}</div>
      <p className="text-muted">{t("game.pausedHint")}</p>
    </div>
  );
}

function Waiting() {
  const t = useT();
  return <div className="flex flex-1 items-center justify-center py-16 text-muted">{t("game.waitingNext")}</div>;
}

/** Боковая панель ученика во время игры: коротко и кнопка «Открыть игру». */
export function StudentGameSidebar({ session }: { session: SessionSnapshot }) {
  const t = useT();
  const g = session.game!;
  const meId = session.me?.playerId;
  const idx = meId ? g.leaders.findIndex((l) => l.id === meId) : -1;
  const me = idx >= 0 ? g.leaders[idx] : undefined;
  return (
    <div className="flex flex-col gap-4 px-4 py-5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{t("game.inProgress")}</span>
        <StatusDot status={session.status} withText={false} />
      </div>
      <div className="text-[18px] font-bold">{t("game.quiz")}</div>
      {me && (
        <Card className="grid grid-cols-2 gap-2 p-3 text-center">
          <div>
            <div className="text-[11px] text-muted">{t("game.yourPlace")}</div>
            <div className="text-[20px] font-bold tabular">{idx + 1}</div>
          </div>
          <div>
            <div className="text-[11px] text-muted">{t("game.score")}</div>
            <div className="text-[20px] font-bold tabular">{me.score}</div>
          </div>
        </Card>
      )}
      <Button variant="primary" size="lg" block icon={<Gamepad2 size={18} />} onClick={() => host.post({ type: "open_panel" })}>
        {t("game.open")}
      </Button>
    </div>
  );
}
