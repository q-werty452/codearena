import { motion } from "motion/react";
import { ArrowLeft, Bug, Flag, MessageCircleQuestion, MoveHorizontal, SquareCode, type LucideIcon } from "lucide-react";
import type { GameKind, TeamMode } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { cn } from "../../lib/cn.ts";
import { useT, type MessageKey } from "../../lib/i18n.ts";

const GAMES: { kind: GameKind; icon: LucideIcon; color: string; ready: boolean }[] = [
  { kind: "quiz", icon: MessageCircleQuestion, color: "#8B5CF6", ready: true },
  { kind: "tug", icon: MoveHorizontal, color: "#F43F5E", ready: false },
  { kind: "codewars", icon: SquareCode, color: "#3B82F6", ready: false },
  { kind: "race", icon: Flag, color: "#10B981", ready: false },
  { kind: "bug", icon: Bug, color: "#F59E0B", ready: false },
];

/** Выбор игры: 5 крупных карточек. Недоступные — с пометкой и причиной. */
export function GamePicker({ mode, onPick, onBack }: { mode: TeamMode; onPick: (g: GameKind) => void; onBack: () => void }) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 py-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
          {t("pick.back")}
        </Button>
      </div>
      <h1 className="text-title font-bold">{t("pick.title")}</h1>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
        {GAMES.map((g, i) => {
          const tugBlocked = g.kind === "tug" && mode !== "teams2";
          const disabled = !g.ready || tugBlocked;
          const Icon = g.icon;
          return (
            <motion.button
              key={g.kind}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.2 }}
              whileHover={disabled ? undefined : { y: -3 }}
              whileTap={disabled ? undefined : { scale: 0.98 }}
              disabled={disabled}
              onClick={() => onPick(g.kind)}
              className={cn(
                "group relative flex min-h-[150px] flex-col items-start gap-3 rounded-card border border-border bg-surface p-5 text-left transition-colors",
                disabled ? "opacity-55" : "hover:border-[var(--ca-accent)]",
              )}
            >
              <span className="flex size-11 items-center justify-center rounded-[12px] text-white" style={{ background: g.color }}>
                <Icon size={22} strokeWidth={2.2} />
              </span>
              <div>
                <div className="text-[16px] font-bold">{t(`game.${g.kind}` as MessageKey)}</div>
                <div className="mt-1 text-[13px] text-muted">
                  {tugBlocked && g.ready ? t("game.tug.need2") : t(`game.${g.kind}.desc` as MessageKey)}
                </div>
              </div>
              {!g.ready && (
                <span className="absolute right-3 top-3 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-muted">
                  {t("game.soon")}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
