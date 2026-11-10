import { AnimatePresence, motion } from "motion/react";
import { Check, CircleHelp, LogOut, MessageCircleQuestion, PenLine } from "lucide-react";
import type { LessonStatus, SessionSnapshot } from "@codearena/shared";
import { Avatar, TeamBadge } from "../ui/Avatar.tsx";
import { Kbd } from "../ui/Card.tsx";
import { StatusDot } from "../ui/Status.tsx";
import { cn } from "../lib/cn.ts";
import { prettyCode, useT, type MessageKey } from "../lib/i18n.ts";
import { host } from "../lib/session.ts";

const STATUSES: { status: LessonStatus; key: MessageKey; icon: typeof Check; color: string; hotkey: string }[] = [
  { status: "done", key: "lesson.done", icon: Check, color: "var(--ca-success)", hotkey: "1" },
  { status: "writing", key: "lesson.writing", icon: PenLine, color: "var(--ca-accent)", hotkey: "2" },
  { status: "lost", key: "lesson.lost", icon: CircleHelp, color: "var(--ca-warning)", hotkey: "3" },
];

/**
 * Урок у ученика (боковая панель) — режим комнаты по умолчанию.
 * Главное действие — отметить, как идут дела: учитель видит это сразу.
 */
export function StudentLobby({ session, onLeave }: { session: SessionSnapshot; onLeave: () => void }) {
  const t = useT();
  const { me, lobby, lesson } = session;
  if (!me) return null;
  const teamInfo = me.team !== null ? lobby?.teams.find((x) => x.index === me.team) : undefined;

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <span className="whitespace-nowrap font-mono text-[12px] text-muted tabular">{t("lobby.room", { code: prettyCode(session.code ?? "") })}</span>
        <StatusDot status={session.status} />
      </div>

      <div className="flex flex-1 flex-col gap-5 px-4 py-5">
        <div className="flex items-center gap-3">
          <Avatar name={me.name} team={me.team} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-bold">{me.name}</div>
            <div className="mt-0.5 flex items-center gap-2">
              {teamInfo ? <TeamBadge team={teamInfo.index} name={teamInfo.name} className="px-2 py-0.5 text-[11px]" /> : null}
              <span className="text-[12px] text-muted">
                {t("lesson.title")} · {t("lesson.step", { n: lesson.checkpoint + 1 })}
              </span>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[12px] font-medium text-muted">{t("lesson.howItGoes")}</div>
          <div className="flex flex-col gap-2" role="radiogroup">
            {STATUSES.map(({ status, key, icon: Icon, color, hotkey }) => {
              const on = lesson.myStatus === status;
              return (
                <motion.button
                  key={status}
                  role="radio"
                  aria-checked={on}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => host.post({ type: "lesson_status", status })}
                  className={cn(
                    "relative flex h-12 items-center gap-3 overflow-hidden rounded-btn border-2 px-3 text-left text-[15px] font-semibold transition-colors",
                    on ? "text-white" : "border-border bg-surface hover:bg-surface-2",
                  )}
                  style={on ? { background: color, borderColor: color } : undefined}
                >
                  {on && <motion.span layoutId="lesson-status" className="absolute inset-0" style={{ background: color }} transition={{ type: "spring", stiffness: 500, damping: 40 }} />}
                  <span className="relative z-10 flex size-7 items-center justify-center rounded-full" style={on ? { background: "rgb(255 255 255 / 0.2)" } : { color }}>
                    <Icon size={17} strokeWidth={2.6} />
                  </span>
                  <span className="relative z-10 flex-1">{t(key)}</span>
                  <span className="relative z-10 hidden text-[11px] font-normal opacity-70 min-[260px]:inline">
                    <Kbd>Ctrl+Alt+{hotkey}</Kbd>
                  </span>
                </motion.button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {lesson.iConfused ? (
            <motion.div key="sent" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-btn bg-surface px-3 py-2.5 text-[13px] text-muted">
              <Check size={15} className="text-success" />
              {t("lesson.confusedSent")}
            </motion.div>
          ) : (
            <motion.button
              key="ask"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              onClick={() => host.post({ type: "lesson_confused" })}
              className="flex items-start gap-2.5 rounded-btn border border-dashed border-border px-3 py-2.5 text-left transition-colors hover:border-[var(--ca-warning)] hover:bg-warning/5"
            >
              <MessageCircleQuestion size={17} className="mt-0.5 shrink-0 text-warning" />
              <span>
                <span className="block text-[13px] font-semibold">{t("lesson.confused")}</span>
                <span className="block text-[12px] text-muted">{t("lesson.confusedHint")}</span>
              </span>
            </motion.button>
          )}
        </AnimatePresence>

        <p className="text-[12px] text-muted">{t("lesson.statusBarHint")}</p>
      </div>

      <div className="flex justify-center pb-4">
        <button onClick={onLeave} className="inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] text-muted transition-colors hover:text-fg">
          <LogOut size={13} /> {t("lobby.leave")}
        </button>
      </div>
    </div>
  );
}
