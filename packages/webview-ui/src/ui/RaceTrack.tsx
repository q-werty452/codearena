import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Flag } from "lucide-react";
import { cn, initials } from "../lib/cn.ts";
import { teamColor } from "./Avatar.tsx";
import { TeamIcon } from "./Shapes.tsx";

const RUNNER_COLORS = ["#F43F5E", "#3B82F6", "#F59E0B", "#10B981", "#8B5CF6", "#06B6D4", "#EC4899", "#84CC16"];
const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export interface Lane {
  id: string;
  label: string;
  /** Пройдено шагов (может быть дробным у команды). */
  pos: number;
  team?: number | null;
  /** Командная дорожка — иконка команды вместо инициалов. */
  isTeam?: boolean;
  me?: boolean;
  finished?: boolean;
}

/**
 * Трасса гонки: дорожка на игрока или команду, бегунок едет к клетчатому финишу.
 * Пружинная анимация на каждом шаге; при reduced motion — мягкий переход.
 */
export function RaceTrack({ lanes, length, compact }: { lanes: Lane[]; length: number; compact?: boolean }) {
  const reduce = useReducedMotion();
  const h = compact ? 30 : 40;
  return (
    <LayoutGroup>
      <div className="flex flex-col gap-1.5">
        {lanes.map((l) => {
          const pct = Math.min(100, (Math.min(l.pos, length) / Math.max(1, length)) * 100);
          // Команда — цвет команды; без команд — у каждого свой яркий цвет (видно на проекторе).
          const color = l.team !== undefined && l.team !== null ? teamColor(l.team) : l.me ? "var(--ca-accent)" : RUNNER_COLORS[hash(l.id) % RUNNER_COLORS.length]!;
          return (
            <motion.div key={l.id} layout transition={{ type: "spring", stiffness: 400, damping: 40 }} className="flex items-center gap-2.5">
              <div className={cn("w-28 shrink-0 truncate text-right text-[12px]", l.me ? "font-bold text-fg" : "text-muted")} title={l.label}>
                {l.label}
              </div>
              <div
                className={cn("relative flex-1 overflow-visible rounded-full border", l.me ? "border-accent/60" : "border-border")}
                style={{
                  height: h,
                  background: `repeating-linear-gradient(90deg, transparent 0 calc(${100 / Math.max(1, length)}% - 1px), var(--ca-border) calc(${100 / Math.max(1, length)}% - 1px) calc(${100 / Math.max(1, length)}%)), var(--ca-surface)`,
                }}
              >
                {/* Пройденный путь */}
                <motion.div
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ background: `color-mix(in srgb, ${color} 22%, transparent)` }}
                  animate={{ width: `${pct}%` }}
                  transition={reduce ? { duration: 0.3 } : { type: "spring", stiffness: 220, damping: 20 }}
                />
                {/* Финиш */}
                <div
                  className="absolute inset-y-0 right-0 w-3 rounded-r-full opacity-80"
                  style={{ background: "repeating-conic-gradient(var(--ca-fg) 0 25%, transparent 0 50%) 0 0 / 6px 6px" }}
                />
                {/* Бегунок */}
                <motion.div
                  className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
                  animate={{ left: `calc(${Math.max(pct, 0)}% + ${pct < 4 ? h / 2 : pct > 96 ? -h / 2 : 0}px)` }}
                  transition={reduce ? { duration: 0.3 } : { type: "spring", stiffness: 260, damping: 16 }}
                >
                  <div
                    className="flex items-center justify-center rounded-full font-bold text-white shadow-md ring-2 ring-[var(--ca-bg)]"
                    style={{ width: h - 6, height: h - 6, background: color, fontSize: (h - 6) * 0.38 }}
                  >
                    {l.finished ? <Flag size={(h - 6) * 0.5} /> : l.isTeam && l.team !== null && l.team !== undefined ? <TeamIcon team={l.team} size={(h - 6) * 0.5} /> : initials(l.label)}
                  </div>
                </motion.div>
              </div>
              <div className="w-10 shrink-0 text-right text-[12px] font-semibold tabular text-muted">
                {Number.isInteger(l.pos) ? l.pos : l.pos.toFixed(1)}
              </div>
            </motion.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}
