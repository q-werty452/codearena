import { useEffect, useState, type ReactNode } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { useVsTheme } from "../lib/vsTheme.ts";

/**
 * Индикатор долгого ожидания (thinking-orbs): точечная сфера рядом с подписью.
 * Короткие ожидания не показываем — вспышка на полсекунды выглядит как сбой,
 * поэтому сфера появляется, только если ожидание длится дольше `delayMs`.
 */
export function WaitOrb({ active = true, state, size = 20, delayMs = 2000, children }: { active?: boolean; state: OrbState; size?: 20 | 64; delayMs?: number; children?: ReactNode }) {
  const theme = useVsTheme();
  const [shown, setShown] = useState(active && delayMs === 0);
  useEffect(() => {
    if (!active) return void setShown(false);
    if (delayMs === 0) return void setShown(true);
    const t = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  const orb = shown ? <ThinkingOrb state={state} size={size} theme={theme} aria-hidden="true" /> : null;
  if (!children) return orb;
  // Подпись видна сразу, сфера добавляется рядом, если ждать приходится долго.
  return (
    <span className="inline-flex items-center gap-2" role="status">
      {orb}
      <span>{children}</span>
    </span>
  );
}
