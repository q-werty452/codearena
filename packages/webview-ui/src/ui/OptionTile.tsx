import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { OPTION_SHAPES } from "@codearena/shared";
import { cn } from "../lib/cn.ts";
import { Shape } from "./Shapes.tsx";

type State = "idle" | "picked" | "correct" | "wrong" | "dim";

/** Плитка варианта ответа как в Kahoot: цвет + фигура + номер клавиши. */
export function OptionTile({
  index,
  children,
  state = "idle",
  onClick,
  disabled,
}: {
  index: number;
  children: React.ReactNode;
  state?: State;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const shape = OPTION_SHAPES[index] ?? "square";
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { y: -2 }}
      whileTap={disabled ? undefined : { scale: 0.97 }}
      animate={{ opacity: state === "dim" ? 0.35 : 1, scale: state === "picked" ? 0.98 : 1 }}
      transition={{ duration: 0.18 }}
      className={cn(
        "group relative flex min-h-[72px] w-full items-center gap-3 rounded-card px-4 py-3 text-left text-white",
        "shadow-[inset_0_-3px_0_rgb(0_0_0/0.18),inset_0_1px_0_rgb(255_255_255/0.18)]",
        state === "picked" && "ring-4 ring-white/70",
      )}
      style={{
        background: `color-mix(in srgb, var(--ca-opt-${index}) calc(100% - var(--ca-game-shade)), #000)`,
      }}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-[9px] bg-black/15">
        <Shape shape={shape} size={18} />
      </span>
      <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug">{children}</span>
      {state === "correct" && <Check className="shrink-0" size={22} strokeWidth={3} />}
      {state === "wrong" && <X className="shrink-0" size={22} strokeWidth={3} />}
      {state === "idle" && (
        <span className="hidden shrink-0 rounded-[5px] bg-black/20 px-1.5 font-mono text-[11px] opacity-70 sm:inline">
          {index + 1}
        </span>
      )}
    </motion.button>
  );
}
