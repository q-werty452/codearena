import { Clock, Pause, Play, Square } from "lucide-react";
import { useEffect, useRef } from "react";
import type { GameSnapshot, SessionSnapshot } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card, SectionTitle } from "../../ui/Card.tsx";
import { Countdown, Leaderboard, SoundToggle } from "../../ui/Game.tsx";
import { RaceTrack, type Lane } from "../../ui/RaceTrack.tsx";
import { StatusDot } from "../../ui/Status.tsx";
import { cn } from "../../lib/cn.ts";
import { play, secondsLeft, useNow } from "../../lib/game.ts";
import { prettyCode, useT } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { formatClock } from "../StudentTug.tsx";

/** Гонка у учителя: все дорожки, таймер, финишировавшие. Видно с последней парты. */
export function TeacherRace({ session, g }: { session: SessionSnapshot; g: GameSnapshot }) {
  const t = useT();
  const now = useNow(250);
  const left = secondsLeft(g, now);
  const paused = g.phase === "paused";
  const teams = session.lobby?.teams ?? [];
  const isTeams = g.teamScores.length > 0;

  const lanes: Lane[] = isTeams
    ? teams.map((tm) => ({ id: `team-${tm.index}`, label: tm.name, pos: g.teamScores[tm.index] ?? 0, team: tm.index, isTeam: true, finished: (g.teamScores[tm.index] ?? 0) >= g.count }))
    : g.leaders.map((l) => ({ id: l.id, label: l.name, pos: l.progress, team: l.team, finished: l.progress >= g.count }));

  // Каждый финиш — звук.
  const finished = g.answered;
  const lastFinished = useRef(finished);
  useEffect(() => {
    if (finished > lastFinished.current) play("correct");
    lastFinished.current = finished;
  }, [finished]);

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[color-mix(in_srgb,var(--ca-team-2)_15%,transparent)] px-2.5 py-1 text-[12px] font-semibold text-[var(--ca-team-2)]">{t("game.race")}</span>
          <span className="text-[13px] text-muted">{t("race.steps", { n: g.count })}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[12px] text-muted tabular">{prettyCode(session.code ?? "")}</span>
          <StatusDot status={session.status} withText={false} />
          <SoundToggle />
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-5 px-6 py-5">
        {g.phase === "countdown" || (paused && g.index < 0) ? (
          <Countdown left={left} title={t("game.race")} />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="text-[14px] font-semibold tabular">{t("race.finishedCount", { n: g.answered, total: g.total })}</span>
              <span className={cn("inline-flex items-center gap-2 font-mono text-[40px] font-bold leading-none tabular", left <= 30 && "text-warning")}>
                <Clock size={24} className="text-muted" />
                {formatClock(left)}
              </span>
            </div>
            <Card className="p-4">
              <RaceTrack lanes={lanes} length={g.count} />
            </Card>
            {isTeams && (
              <Card className="p-4">
                <SectionTitle>{t("game.top")}</SectionTitle>
                <Leaderboard rows={g.leaders} limit={8} compact />
              </Card>
            )}
          </>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[1100px] items-center justify-between gap-3 px-6 py-3">
          <Button icon={paused ? <Play size={14} /> : <Pause size={14} />} onClick={() => host.send({ type: paused ? "resume" : "pause" })}>
            {paused ? t("game.resume") : t("game.pause")}
          </Button>
          <Button variant="primary" size="lg" icon={<Square size={16} />} onClick={() => host.send({ type: g.phase === "countdown" ? "next" : "end_game" })}>
            {g.phase === "countdown" ? t("game.next") : t("game.finish")}
          </Button>
        </div>
      </footer>
    </div>
  );
}
