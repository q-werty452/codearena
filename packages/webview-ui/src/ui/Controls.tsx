import { motion, AnimatePresence } from "motion/react";
import { WifiOff } from "lucide-react";
import { useId, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/** Сегментированный переключатель («Каждый сам за себя / 2 команды / 3 команды»). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean }[];
  className?: string;
}) {
  const group = useId();
  return (
    <div role="radiogroup" className={cn("inline-flex rounded-btn border border-border bg-surface p-[3px]", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            role="radio"
            aria-checked={on}
            disabled={o.disabled}
            onClick={() => onChange(o.value)}
            className={cn(
              "relative h-7 flex-1 whitespace-nowrap rounded-[7px] px-3 text-[12px] font-medium transition-colors duration-150",
              on ? "text-fg" : "text-muted hover:text-fg",
              o.disabled && "opacity-40",
            )}
          >
            {on && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 rounded-[7px] border border-border bg-bg shadow-[0_1px_2px_rgb(0_0_0/0.08)]"
                transition={{ type: "spring", stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Переключатель вкл/выкл (например, звук). */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-left text-[13px] text-fg"
    >
      <span
        className={cn(
          "relative h-5 w-9 rounded-full border transition-colors duration-150",
          checked ? "border-accent bg-accent" : "border-border bg-surface-2",
        )}
      >
        <motion.span
          className="absolute top-[2px] size-[14px] rounded-full bg-white shadow"
          animate={{ left: checked ? 18 : 2 }}
          transition={{ type: "spring", stiffness: 600, damping: 35 }}
        />
      </span>
      {label}
    </button>
  );
}

/** Баннер «Соединение потеряно, переподключаемся…». */
export function ConnectionBanner({ show, text }: { show: boolean; text: string }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: -32, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -32, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-3 py-1.5 text-[12px] font-semibold text-black"
          role="status"
        >
          <WifiOff size={14} />
          {text}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Логотип: фиолетовый знак «‹/›» в скруглённом квадрате + название. */
export function Logo({ size = 28, withText = true }: { size?: number; withText?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="ca-logo" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#A78BFA" />
            <stop offset="1" stopColor="#7C3AED" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#ca-logo)" />
        <path d="M12.5 10.5 7 16l5.5 5.5M19.5 10.5 25 16l-5.5 5.5" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="16" cy="16" r="1.9" fill="#fff" />
      </svg>
      {withText && (
        <span className="text-[16px] font-bold tracking-[-0.01em]">
          Code<span className="text-accent">Arena</span>
        </span>
      )}
    </div>
  );
}

/** Таймер-кольцо. Последние 5 секунд — оранжевый и пульсирует. */
export function TimerRing({ left, total, size = 64 }: { left: number; total: number; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
  const urgent = left <= 5;
  const secs = Math.ceil(left);
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--ca-surface-2)" strokeWidth={5} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={urgent ? "var(--ca-warning)" : "var(--ca-accent)"}
          strokeWidth={5}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.2s" }}
        />
      </svg>
      <motion.span
        key={urgent ? secs : "calm"}
        initial={urgent ? { scale: 1.25 } : false}
        animate={{ scale: 1 }}
        transition={{ duration: 0.25 }}
        className={cn("absolute font-bold tabular", urgent && "text-warning")}
        style={{ fontSize: size * 0.34 }}
      >
        {secs}
      </motion.span>
    </div>
  );
}
