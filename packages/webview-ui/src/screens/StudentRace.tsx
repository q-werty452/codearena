import { AnimatePresence, motion } from "motion/react";
import { Clock, FileCode2, Flag, Play, Send, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameSnapshot, SessionSnapshot } from "@codearena/shared";
import { Button } from "../ui/Button.tsx";
import { Card, Kbd, SectionTitle } from "../ui/Card.tsx";
import { CodeAwareText, QuestionView, type TileState } from "../ui/Game.tsx";
import { RaceTrack, type Lane } from "../ui/RaceTrack.tsx";
import { TimerRing } from "../ui/Controls.tsx";
import { cn } from "../lib/cn.ts";
import { play, secondsLeft, useNow } from "../lib/game.ts";
import { useT } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";
import { formatClock, TugTaskView } from "./StudentTug.tsx";
import { NoPython, TestRow } from "./StudentCodewars.tsx";

/** Дорожки: в командах — по команде, иначе — я и ближайшие соперники. */
export function raceLanes(g: GameSnapshot, session: SessionSnapshot, max = 6): Lane[] {
  const teams = session.lobby?.teams ?? [];
  if (g.teamScores.length > 0) {
    return teams.map((t) => ({ id: `team-${t.index}`, label: t.name, pos: g.teamScores[t.index] ?? 0, team: t.index, isTeam: true, finished: (g.teamScores[t.index] ?? 0) >= g.count }));
  }
  const meId = session.me?.playerId;
  const rows = g.leaders.map((l) => ({ id: l.id, label: l.name, pos: l.progress, me: l.id === meId, finished: l.progress >= g.count }));
  const mine = rows.find((r) => r.me);
  const top = rows.slice(0, max);
  return mine && !top.includes(mine) ? [...top.slice(0, max - 1), mine] : top;
}

/** Гонка у ученика: трасса сверху, своё текущее задание снизу. */
export function StudentRaceBody({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const t = useT();
  const now = useNow(200);
  const left = secondsLeft(g, now);
  const meId = session.me?.playerId;
  const me = g.leaders.find((l) => l.id === meId);
  const pos = me?.progress ?? 0;
  const finished = !!g.result?.correct && g.result.place !== null;
  const lockedLeft = g.lockedUntil ? Math.max(0, (g.lockedUntil - now) / 1000) : 0;

  // +1 шаг — короткая вспышка и звук; ошибка — звук.
  const [flash, setFlash] = useState(0);
  const last = useRef(g.result);
  useEffect(() => {
    if (g.result && g.result !== last.current) {
      if (g.result.correct) {
        play(g.result.place ? "win" : "correct");
        setFlash((n) => n + 1);
      } else play("wrong");
    }
    last.current = g.result;
  }, [g.result]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[14px] font-semibold tabular">{t("race.step", { n: Math.min(pos + 1, g.count), total: g.count })}</span>
        <span className={cn("inline-flex items-center gap-1.5 font-mono text-[22px] font-bold tabular", left <= 30 && "text-warning")}>
          <Clock size={16} className="text-muted" />
          {formatClock(left)}
        </span>
      </div>

      <RaceTrack lanes={raceLanes(g, session)} length={g.count} compact />

      <AnimatePresence>
        {flash > 0 && !finished && (
          <motion.div key={flash} initial={{ opacity: 0, y: 8, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} className="self-center rounded-full bg-success px-3 py-1 text-[13px] font-bold text-white">
            {t("race.plusOne")}
          </motion.div>
        )}
      </AnimatePresence>

      {finished ? (
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: [0.9, 1.05, 1], opacity: 1 }} className="flex items-center gap-4 rounded-card bg-success p-5 text-white">
          <span className="flex size-12 items-center justify-center rounded-full bg-white/20">
            {g.result?.place === 1 ? <Trophy size={26} /> : <Flag size={26} />}
          </span>
          <div>
            <div className="text-[22px] font-bold">{t("race.finished", { n: g.result?.place ?? "?" })}</div>
            <div className="text-[13px] opacity-90">{t("race.finishedHint")}</div>
          </div>
        </motion.div>
      ) : g.task ? (
        <RaceTask g={g} lockedLeft={lockedLeft} />
      ) : null}
    </div>
  );
}

function RaceTask({ g, lockedLeft }: { g: GameSnapshot; lockedLeft: number }) {
  const t = useT();
  const task = g.task!;
  const [value, setValue] = useState("");
  useEffect(() => setValue(""), [task.id]);
  const locked = lockedLeft > 0;

  if (task.type === "short_answer") {
    return (
      <TugTaskView
        prompt={task.prompt}
        value={value}
        onChange={setValue}
        onSubmit={() => host.post({ type: "answer", taskId: task.id, answer: value.trim() })}
        lockedLeft={lockedLeft}
        lockTotal={g.settings.wrongLockSec || 3}
        autoFocus
        submitLabel={t("race.answer")}
      />
    );
  }

  if (task.type === "choice") {
    return (
      <div className="relative">
        <QuestionView
          prompt={task.prompt}
          options={task.options}
          states={task.options.map((): TileState => (locked ? "dim" : "idle"))}
          onPick={locked ? undefined : (i) => host.post({ type: "answer", taskId: task.id, answer: i })}
        />
        {locked && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex items-center gap-2 rounded-full bg-error px-4 py-2 font-semibold text-white shadow-lg">
              <TimerRing left={lockedLeft} total={g.settings.wrongLockSec || 3} size={30} />
              {t("tug.locked", { n: Math.ceil(lockedLeft) })}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (task.type === "code") {
    const run = g.localRun?.taskId === task.id ? g.localRun : null;
    const rules = task.language === "html" || task.language === "css";
    const checks = rules ? task.rules.map((r) => ({ call: r.label, expected: "" })) : task.tests;
    const results = run?.results ?? [];
    return (
      <div className="flex flex-col gap-3">
        <Card className="p-4">
          <p className="whitespace-pre-wrap text-[15px] font-semibold">
            <CodeAwareText text={task.prompt} />
          </p>
        </Card>
        {run?.error === "no_python" && <NoPython />}
        <div>
          <SectionTitle>{t("bug.rules")}</SectionTitle>
          <ol className="flex flex-col gap-1.5">
            {checks.map((c, i) => (
              <TestRow key={i} call={c.call} expected={c.expected} result={results[i]} running={!!run?.running} />
            ))}
          </ol>
        </div>
        <Button variant="primary" size="lg" block icon={<Send size={18} />} loading={!!run?.running && run.submitted} disabled={!!run?.running} onClick={() => host.post({ type: "submit_code" })}>
          {t("cw.submit")}
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Button icon={<Play size={14} />} disabled={!!run?.running} onClick={() => host.post({ type: "run_tests" })}>
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
    );
  }
  return null;
}
