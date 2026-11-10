import { motion, type HTMLMotionProps } from "motion/react";
import { forwardRef, type ReactNode } from "react";
import { cn } from "../lib/cn.ts";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  block?: boolean;
  loading?: boolean;
  children?: ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.18)] disabled:bg-surface-2 disabled:text-muted disabled:shadow-none",
  secondary: "bg-surface border border-border text-fg hover:bg-surface-2 disabled:text-muted",
  ghost: "bg-transparent text-fg hover:bg-hover disabled:text-muted",
  danger: "bg-transparent border border-border text-error hover:bg-error/10 hover:border-error/40",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] gap-1.5 rounded-[8px]",
  md: "h-9 px-3.5 text-[13px] gap-2 rounded-btn",
  lg: "h-12 px-5 text-btn font-semibold gap-2.5 rounded-btn",
};

/** Кнопка. Главное действие экрана — variant="primary" size="lg" (не ниже 44 px). */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, block, loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ duration: 0.12 }}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center font-medium",
        "transition-colors duration-150 ease-out",
        variants[variant],
        // Во всю ширину узкой боковой панели текст переносится, а не обрезается.
        block ? "w-full text-center leading-tight" : "whitespace-nowrap",
        block && size === "lg" ? sizes.lg.replace("h-12", "min-h-12 py-2") : sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="shrink-0" /> : icon && <span className="shrink-0">{icon}</span>}
      {children && <span className={cn(loading && "opacity-80")}>{children}</span>}
      {!loading && iconRight && <span className="shrink-0">{iconRight}</span>}
    </motion.button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
