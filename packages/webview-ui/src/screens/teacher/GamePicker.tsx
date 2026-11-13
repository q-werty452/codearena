import { motion } from "motion/react";
import { ArrowLeft, Bug, Flag, MessageCircleQuestion, MoveHorizontal, ShieldCheck, SquareCode, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { AntiCheatSettings, GameKind, TeamMode } from "@codearena/shared";
import { Card } from "../../ui/Card.tsx";
import { Segmented, Toggle } from "../../ui/Controls.tsx";
import { Button } from "../../ui/Button.tsx";
import { cn } from "../../lib/cn.ts";
import { useT, type MessageKey } from "../../lib/i18n.ts";

export const GAMES: { kind: GameKind; icon: LucideIcon; color: string; ready: boolean }[] = [
  { kind: "quiz", icon: MessageCircleQuestion, color: "#8B5CF6", ready: true },
  { kind: "bug", icon: Bug, color: "#F59E0B", ready: true },
  { kind: "tug", icon: MoveHorizontal, color: "#F43F5E", ready: true },
  { kind: "codewars", icon: SquareCode, color: "#3B82F6", ready: true },
  { kind: "race", icon: Flag, color: "#10B981", ready: true },
];

/** Выбор игры: 5 крупных карточек. Недоступные — с пометкой и причиной. */
export function GamePicker({
  mode,
  onPick,
  onBack,
  antiCheat,
  onAntiCheat,
  extra,
}: {
  mode: TeamMode;
  onPick: (g: GameKind) => void;
  onBack: () => void;
  antiCheat: AntiCheatSettings;
  onAntiCheat: (a: AntiCheatSettings) => void;
  /** «Мои задания» под карточками игр. */
  extra?: ReactNode;
}) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6 px-6 py-5">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
          {t("pick.back")}
        </Button>
      </div>
      <h1 className="text-title font-semibold">{t("pick.title")}</h1>
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
                <div className="text-[16px] font-semibold">{t(`game.${g.kind}` as MessageKey)}</div>
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
      {extra}
      <AntiCheatCard value={antiCheat} onChange={onAntiCheat} />
    </div>
  );
}

/** Защита от списывания: каждая включается отдельно, работает только во время игры. */
function AntiCheatCard({ value, onChange }: { value: AntiCheatSettings; onChange: (a: AntiCheatSettings) => void }) {
  const t = useT();
  const set = (p: Partial<AntiCheatSettings>) => onChange({ ...value, ...p });
  return (
    <Card className="p-5">
      <div className="mb-1 flex items-center gap-2">
        <ShieldCheck size={18} className="text-muted" />
        <h2 className="text-[14px] font-semibold">{t("ac.title")}</h2>
      </div>
      <p className="mb-4 text-[12px] text-muted">{t("ac.hint")}</p>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <Toggle checked={value.pasteBlock} onChange={(v) => set({ pasteBlock: v })} label={t("ac.paste")} />
        <Toggle checked={value.bigInsertDetect} onChange={(v) => set({ bigInsertDetect: v })} label={t("ac.bigInsert")} />
        <Toggle checked={value.focusTracking} onChange={(v) => set({ focusTracking: v })} label={t("ac.focus")} />
        <Toggle checked={value.aiExtensions} onChange={(v) => set({ aiExtensions: v })} label={t("ac.ai")} />
      </div>
      <label className="mt-4 flex items-center gap-2">
        <span className="text-[12px] text-muted">{t("ac.limit")}</span>
        <Segmented<string>
          value={String(value.pasteLimit)}
          onChange={(v) => set({ pasteLimit: Number(v) })}
          options={[10, 30, 100].map((n) => ({ value: String(n), label: t("ac.chars", { n }) }))}
        />
      </label>
    </Card>
  );
}
