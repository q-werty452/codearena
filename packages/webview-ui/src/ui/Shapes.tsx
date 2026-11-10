import { Droplet, Flame, Leaf } from "lucide-react";
import type { OptionShape } from "@codearena/shared";

/** Фигура варианта ответа: треугольник, ромб, круг, квадрат. */
export function Shape({ shape, size = 20, className }: { shape: OptionShape; size?: number; className?: string }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", className, "aria-hidden": true } as const;
  switch (shape) {
    case "triangle":
      return (
        <svg {...common}>
          <path d="M12 3.5 22 20.5H2z" fill="currentColor" strokeLinejoin="round" />
        </svg>
      );
    case "diamond":
      return (
        <svg {...common}>
          <path d="M12 2 22 12 12 22 2 12z" fill="currentColor" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="10" fill="currentColor" />
        </svg>
      );
    case "square":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" />
        </svg>
      );
  }
}

const TEAM_ICON = [Flame, Droplet, Leaf] as const;

/** Иконка команды — чтобы команды отличались не только цветом. */
export function TeamIcon({ team, size = 14, className }: { team: number; size?: number; className?: string }) {
  const Icon = TEAM_ICON[team] ?? Flame;
  return <Icon size={size} className={className} strokeWidth={2.4} aria-hidden />;
}
