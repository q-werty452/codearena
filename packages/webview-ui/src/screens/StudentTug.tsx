import { AnimatePresence, motion, useAnimationControls } from "motion/react";
import { ArrowRight, Lock, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameSnapshot, SessionSnapshot } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { TimerRing } from "../ui/Controls.tsx";
import { CodeAwareText } from "../ui/Game.tsx";
import { Rope } from "../ui/Rope.tsx";
import { teamColor } from "../ui/Avatar.tsx";
import { cn } from "../lib/cn.ts";
import { play, secondsLeft, useNow } from "../lib/game.ts";
import { useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";

export function formatClock(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Задание каната: текст крупно + поле ответа. Используется и в предпросмотре редактора. */
export function TugTaskView({
  prompt,
  value,
  onChange,
  onSubmit,
  lockedLeft = 0,
  lockTotal = 3,
  disabled,
  shake,
  autoFocus,
}: {
  prompt: string;
  value: string;
  onChange?: (v: string) => void;
  onSubmit?: () => void;
  lockedLeft?: number;
  lockTotal?: number;
  disabled?: boolean;
  shake?: number;
  autoFocus?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const locked = lockedLeft > 0;
  // Тряска без пересоздания поля — иначе теряется фокус.
  const shakeCtl = useAnimationControls();
  useEffect(() => {
    if (shake) void shakeCtl.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
  }, [shake, shakeCtl]);
  // После разблокировки и смены задания курсор возвращается в поле.
  useEffect(() => {
    if (!locked && autoFocus) ref.current?.focus();
  }, [locked, prompt, autoFocus]);

  return (
    <div className="flex flex-col items-center gap-5">
      <AnimatePresence mode="popLayout">
        <motion.h2
          key={prompt}
          initial={{ opacity: 0, y: 12, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.2 }}
          className="whitespace-pre-wrap text-center text-[30px] font-bold leading-tight"
        >
          <CodeAwareText text={prompt} />
        </motion.h2>
      </AnimatePresence>
      <form
        className="flex w-full max-w-[460px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!locked && value.trim()) onSubmit?.();
        }}
      >
        <motion.div
          animate={shakeCtl}
          className={cn(
            "relative flex h-14 flex-1 items-center rounded-btn border-2 bg-input px-4 transition-colors",
            locked ? "border-error/60" : "border-border focus-within:border-[var(--ca-accent)]",
          )}
        >
          <input
            ref={ref}
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
            disabled={disabled || locked}
            placeholder={t("tug.yourAnswer")}
            aria-label={t("tug.yourAnswer")}
            maxLength={100}
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent font-mono text-[20px] font-semibold outline-none placeholder:font-sans placeholder:text-[16px] placeholder:font-normal placeholder:text-muted/70"
          />
          {locked && (
            <span className="flex items-center gap-2 text-[13px] font-semibold text-error">
              <TimerRing left={lockedLeft} total={lockTotal} size={34} />
            </span>
          )}
        </motion.div>
        <Button type="submit" variant="primary" size="lg" className="h-14 px-6" disabled={disabled || locked || !value.trim()} icon={locked ? <Lock size={18} /> : <Zap size={18} />}>
          {locked ? t("tug.locked", { n: Math.ceil(lockedLeft) }) : t("tug.send")}
        </Button>
      </form>
    </div>
  );
}

/** Игра ученика в канате. */
export function StudentTugBody({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const t = useT();
  const now = useNow();
  const left = secondsLeft(g, now);
  const [value, setValue] = useState("");
  const [shake, setShake] = useState(0);
  const myTeam = session.me?.team ?? null;
  const names = (session.lobby?.teams.map((x) => x.name) ?? ["", ""]) as [string, string];
  const lockedLeft = g.lockedUntil ? Math.max(0, (g.lockedUntil - now) / 1000) : 0;
  const task = g.task?.type === "short_answer" ? g.task : null;

  // Новое задание — очистить поле.
  useEffect(() => setValue(""), [task?.id]);

  // Реакция на мой результат: верно — звук, неверно — тряска и звук ошибки.
  const lastResult = useRef(g.result);
  useEffect(() => {
    if (g.result && g.result !== lastResult.current) {
      if (g.result.correct) play("correct");
      else {
        play("wrong");
        setShake((n) => n + 1);
      }
    }
    lastResult.current = g.result;
  }, [g.result]);

  const pull = g.lastPull;
  const mine = pull && pull.playerId === session.me?.playerId;

  if (myTeam !== 0 && myTeam !== 1) {
    return <div className="flex flex-1 items-center justify-center py-16 text-center text-muted">{t("tug.noTeam")}</div>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-center gap-3">
        <span className="text-[12px] text-muted">{t("tug.timeLeft")}</span>
        <span className={cn("font-mono text-[28px] font-bold tabular", left <= 10 && "text-warning")}>{formatClock(left)}</span>
      </div>

      <Rope position={g.rope} names={names} scores={g.teamScores as [number, number]} pullKey={pull?.at ?? null} pullTeam={pull?.team ?? null} />

      <div className="h-6 text-center">
        <AnimatePresence mode="wait">
          {pull && now - pull.at < 2500 && (
            <motion.div
              key={pull.at}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 text-[14px] font-semibold"
              style={{ color: teamColor(pull.team) }}
            >
              <Zap size={15} />
              {mine ? t("tug.youPulled") : t("tug.pulled", { name: pull.name, team: names[pull.team] ?? "" })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {task && (
        <TugTaskView
          prompt={task.prompt}
          value={value}
          onChange={setValue}
          onSubmit={() => host.post({ type: "answer", taskId: task.id, answer: value.trim() })}
          lockedLeft={lockedLeft}
          lockTotal={g.settings.wrongLockSec || 3}
          shake={shake}
          autoFocus
        />
      )}
      <p className="flex items-center justify-center gap-1 text-center text-[12px] text-muted">
        Enter <ArrowRight size={12} /> {t("tug.send")}
      </p>
    </div>
  );
}
