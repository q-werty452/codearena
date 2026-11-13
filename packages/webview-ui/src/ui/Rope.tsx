import { motion, useAnimationControls, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { LIMITS } from "@codearena/shared";
import { teamColor } from "./Avatar.tsx";
import { TeamIcon } from "./Shapes.tsx";

/**
 * Канат: верёвка во всю ширину, зоны финиша в цветах команд по краям,
 * узел посередине. Позиция −5 (победа левой команды) … +5 (правой).
 * Каждый рывок — пружинная анимация с лёгким «дёрганьем».
 */
export function Rope({
  position,
  names,
  scores,
  pullKey,
  pullTeam,
  compact,
}: {
  position: number;
  names: [string, string];
  scores?: [number, number];
  /** Меняется при каждом рывке — запускает «дёрганье». */
  pullKey?: number | null;
  pullTeam?: number | null;
  compact?: boolean;
}) {
  const reduce = useReducedMotion();
  const jerk = useAnimationControls();
  const step = 45 / LIMITS.ropeLimit; // % ширины на один шаг
  const knotLeft = 50 + position * step;

  useEffect(() => {
    if (!pullKey || reduce) return;
    const dir = pullTeam === 0 ? -1 : 1;
    void jerk.start({ x: [0, dir * 10, dir * -3, 0], transition: { duration: 0.45, times: [0, 0.25, 0.6, 1] } });
  }, [pullKey, pullTeam, reduce, jerk]);

  const spring = reduce ? { duration: 0.3 } : { type: "spring" as const, stiffness: 260, damping: 14, mass: 0.9 };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <TeamLabel team={0} name={names[0]} score={scores?.[0]} align="left" />
        <TeamLabel team={1} name={names[1]} score={scores?.[1]} align="right" />
      </div>

      <motion.div animate={jerk} className={compact ? "relative h-16" : "relative h-24"}>
        {/* Зоны финиша */}
        <div className="absolute inset-y-0 left-0 w-[5%] rounded-l-[12px]" style={{ background: `color-mix(in srgb, ${teamColor(0)} 22%, transparent)` }} />
        <div className="absolute inset-y-0 right-0 w-[5%] rounded-r-[12px]" style={{ background: `color-mix(in srgb, ${teamColor(1)} 22%, transparent)` }} />
        <div className="absolute inset-y-0 left-[5%] w-[2px]" style={{ background: teamColor(0) }} />
        <div className="absolute inset-y-0 right-[5%] w-[2px]" style={{ background: teamColor(1) }} />

        {/* Метки шагов и центр */}
        {Array.from({ length: LIMITS.ropeLimit * 2 + 1 }, (_, i) => i - LIMITS.ropeLimit).map((n) => (
          <div
            key={n}
            className="absolute bottom-0 w-px"
            style={{
              left: `${50 + n * step}%`,
              height: n === 0 ? "100%" : 8,
              background: n === 0 ? "var(--ca-muted)" : "var(--ca-border)",
              opacity: n === 0 ? 0.5 : 1,
              borderLeft: n === 0 ? "1px dashed var(--ca-muted)" : undefined,
            }}
          />
        ))}

        {/* Верёвка: левая половина в цвет команды 0, правая — команды 1 */}
        <div className="absolute inset-x-0 top-1/2 h-3.5 -translate-y-1/2 overflow-hidden rounded-full shadow-[inset_0_-2px_0_rgb(0_0_0/0.25)]">
          <motion.div
            className="absolute inset-y-0 left-0"
            animate={{ width: `${knotLeft}%` }}
            transition={spring}
            style={{ background: `repeating-linear-gradient(115deg, ${teamColor(0)} 0 7px, color-mix(in srgb, ${teamColor(0)} 70%, #000) 7px 11px)` }}
          />
          <motion.div
            className="absolute inset-y-0 right-0"
            animate={{ width: `${100 - knotLeft}%` }}
            transition={spring}
            style={{ background: `repeating-linear-gradient(115deg, ${teamColor(1)} 0 7px, color-mix(in srgb, ${teamColor(1)} 70%, #000) 7px 11px)` }}
          />
        </div>

        {/* Узел */}
        <motion.div
          className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
          animate={{ left: `${knotLeft}%` }}
          transition={spring}
        >
          <div className="relative flex size-9 items-center justify-center rounded-full border-[3px] border-white bg-[#2a2a2e] shadow-lg">
            <div className="size-3 rounded-full bg-white" />
          </div>
          <div className="absolute left-1/2 top-full h-5 w-[3px] -translate-x-1/2 bg-white/80" />
          <div className="absolute left-1/2 top-[calc(100%+14px)] h-3 w-5 rounded-[2px] bg-warning" />
        </motion.div>
      </motion.div>
    </div>
  );
}

function TeamLabel({ team, name, score, align }: { team: number; name: string; score?: number; align: "left" | "right" }) {
  return (
    <div className={align === "left" ? "flex items-center gap-2" : "flex flex-row-reverse items-center gap-2 text-right"}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-white" style={{ background: teamColor(team) }}>
        <TeamIcon team={team} size={15} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-[14px] font-bold">{name}</div>
        {score !== undefined && <div className="text-[12px] text-muted tabular">{score}</div>}
      </div>
    </div>
  );
}
