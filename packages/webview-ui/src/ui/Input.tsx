import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from "react";
import { motion } from "motion/react";
import { cn } from "../lib/cn.ts";

export interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  hint?: ReactNode;
  error?: string | null;
  icon?: ReactNode;
  big?: boolean;
}

/** Поле ввода. При ошибке — лёгкая тряска и красная рамка. */
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, error, icon, big, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const inputId = id ?? auto;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={inputId} className="text-[12px] font-medium text-muted">
          {label}
        </label>
      )}
      <motion.div
        key={error ?? "ok"}
        animate={error ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.32 }}
        className={cn(
          "group flex items-center gap-2 rounded-btn border bg-input px-3 transition-colors duration-150",
          "focus-within:border-[var(--ca-focus)]",
          error ? "border-error" : "border-border",
          big ? "h-12" : "h-9",
        )}
      >
        {icon && <span className="text-muted group-focus-within:text-fg">{icon}</span>}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            "min-w-0 flex-1 bg-transparent text-[var(--ca-input-fg)] outline-none placeholder:text-muted/70",
            big ? "text-[16px]" : "text-[13px]",
          )}
          aria-invalid={!!error}
          {...rest}
        />
      </motion.div>
      {error ? (
        <p className="text-[12px] text-error">{error}</p>
      ) : hint ? (
        <p className="text-[12px] text-muted">{hint}</p>
      ) : null}
    </div>
  );
});
