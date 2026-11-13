import { motion } from "motion/react";
import { useRef, useState } from "react";
import { cn } from "../lib/cn.ts";

interface Props {
  value: string;
  onChange: (v: string) => void;
  onComplete?: (v: string) => void;
  length?: number;
  error?: boolean;
  autoFocus?: boolean;
  label?: string;
}

/**
 * Код комнаты: 6 крупных ячеек. Под ними одно настоящее поле,
 * поэтому вставка, удаление и мобильная клавиатура работают как обычно.
 */
export function CodeCells({ value, onChange, onComplete, length = 6, error, autoFocus, label }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const active = Math.min(value.length, length - 1);

  return (
    <motion.div
      key={error ? "err" : "ok"}
      animate={error ? { x: [0, -8, 8, -5, 5, 0] } : undefined}
      transition={{ duration: 0.34 }}
      className="relative"
      onClick={() => ref.current?.focus()}
    >
      <input
        ref={ref}
        aria-label={label}
        value={value}
        autoFocus={autoFocus}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={length}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const v = e.target.value.replace(/\D/g, "").slice(0, length);
          onChange(v);
          if (v.length === length) onComplete?.(v);
        }}
        className="absolute inset-0 z-10 w-full cursor-text opacity-0"
      />
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${length}, minmax(0, 1fr))` }}>
        {Array.from({ length }, (_, i) => {
          const ch = value[i];
          const isActive = focused && i === active && value.length < length + 1;
          return (
            <div
              key={i}
              className={cn(
                "relative flex aspect-[4/5] max-h-14 items-center justify-center rounded-btn border bg-input",
                "font-mono text-[20px] font-semibold tabular transition-colors duration-150",
                error ? "border-error" : isActive ? "border-accent" : ch ? "border-border" : "border-border",
              )}
              style={isActive ? { boxShadow: "0 0 0 3px color-mix(in srgb, var(--ca-accent) 22%, transparent)" } : undefined}
            >
              {ch ? (
                <motion.span initial={{ y: 6, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.15 }}>
                  {ch}
                </motion.span>
              ) : isActive ? (
                <span className="h-6 w-[2px] animate-pulse rounded bg-accent" />
              ) : null}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
