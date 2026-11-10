import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { LogOut, Users } from "lucide-react";
import type { SessionSnapshot } from "@codearena/shared";
import { Avatar, TeamBadge, teamColor } from "../ui/Avatar.tsx";
import { TeamIcon } from "../ui/Shapes.tsx";
import { StatusDot } from "../ui/Status.tsx";
import { prettyCode, useT } from "../lib/i18n.ts";

/** Лобби ученика: крупно своё имя и команда, состав команды, спокойное ожидание. */
export function StudentLobby({ session, onLeave }: { session: SessionSnapshot; onLeave: () => void }) {
  const t = useT();
  const { me, lobby } = session;
  if (!me) return null;

  const team = me.team;
  const teamInfo = team !== null ? lobby?.teams.find((x) => x.index === team) : undefined;
  const mates = lobby?.players.filter((p) => team !== null && p.team === team && p.id !== me.playerId) ?? [];
  const isSolo = lobby?.mode === "solo";

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="whitespace-nowrap font-mono text-[12px] text-muted tabular">{t("lobby.room", { code: prettyCode(session.code ?? "") })}</span>
        <StatusDot status={session.status} />
      </div>

      <div className="flex flex-1 flex-col items-center gap-5 px-4 py-8 text-center">
        <motion.div layout className="relative">
          <motion.div
            className="absolute -inset-2 rounded-full"
            style={{ background: teamColor(team), opacity: 0.18 }}
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
          <Avatar name={me.name} team={team} size={72} />
        </motion.div>

        <div className="flex flex-col items-center gap-2">
          <div className="text-[12px] font-medium text-muted">{t("lobby.you")}</div>
          <h1 className="max-w-full break-words text-title font-bold leading-tight">{me.name}</h1>
          <AnimatePresence mode="wait">
            <motion.div key={`${lobby?.mode}-${team}-${teamInfo?.name}`} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {isSolo ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px] text-muted">
                  <Users size={12} /> {t("lobby.solo")}
                </span>
              ) : teamInfo ? (
                <TeamBadge team={teamInfo.index} name={teamInfo.name} />
              ) : (
                <span className="text-[12px] text-muted">{t("lobby.noTeamYet")}</span>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {teamInfo && (
          <div className="w-full max-w-[300px]">
            <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
              <TeamIcon team={teamInfo.index} size={12} />
              {t("lobby.team")} · {mates.length + 1}
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
              <AnimatePresence>
                {mates.map((p) => (
                  <motion.div key={p.id} layout initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}>
                    <Avatar name={p.name} team={p.team} size={30} offline={!p.connected} />
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}

        <WaitingDots />
        <p className="max-w-[240px] text-[13px] text-muted">{t("lobby.waiting")}</p>
      </div>

      <div className="flex justify-center pb-4">
        <button onClick={onLeave} className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] text-muted transition-colors hover:text-fg">
          <LogOut size={13} /> {t("lobby.leave")}
        </button>
      </div>
    </div>
  );
}

/** Три точки, мягко прыгающие по очереди. */
function WaitingDots() {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-6 items-end gap-1.5" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-2 rounded-full bg-accent"
          animate={reduce ? { opacity: [0.35, 1, 0.35] } : { y: [0, -8, 0], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
