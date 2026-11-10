import { cn, initials } from "../lib/cn.ts";
import { TeamIcon } from "./Shapes.tsx";

export const teamColor = (t: number | null | undefined) =>
  t === null || t === undefined ? "var(--ca-muted)" : `var(--ca-team-${t})`;

/** Аватарка-инициалы. Цвет фона — цвет команды, без команды — нейтральный. */
export function Avatar({
  name,
  team,
  size = 32,
  offline,
  className,
}: {
  name: string;
  team?: number | null;
  size?: number;
  offline?: boolean;
  className?: string;
}) {
  const hasTeam = team !== null && team !== undefined;
  return (
    <div
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        offline && "opacity-45 grayscale",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: hasTeam ? teamColor(team) : "color-mix(in srgb, var(--ca-fg) 18%, var(--ca-bg))",
        color: hasTeam ? "#fff" : "var(--ca-fg)",
        boxShadow: hasTeam ? "inset 0 0 0 1px rgb(255 255 255 / 0.15)" : "inset 0 0 0 1px var(--ca-border)",
      }}
      title={name}
    >
      {initials(name)}
    </div>
  );
}

/** Метка команды: цвет + иконка + название. */
export function TeamBadge({ team, name, className }: { team: number; name: string; className?: string }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-semibold text-white", className)}
      style={{ background: teamColor(team) }}
    >
      <TeamIcon team={team} size={12} />
      {name}
    </span>
  );
}
