import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

/** Карточка: тонкая рамка вместо тени, скругление 12 px. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-card border border-border bg-surface", className)} {...rest} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{children}</h3>
      {action}
    </div>
  );
}

/** Скелетон вместо голого спиннера при загрузке. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("ca-skeleton", className)} aria-hidden />;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border bg-surface px-1 font-mono text-[11px] text-muted">
      {children}
    </kbd>
  );
}
