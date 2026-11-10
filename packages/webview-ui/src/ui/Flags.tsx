import { Bot, ClipboardPaste, EyeOff, Wand2, type LucideIcon } from "lucide-react";
import type { FlagAgg, FlagKind, PlayerFlags } from "@codearena/shared";
import { useT, type MessageKey } from "../lib/i18n.ts";

const ICON: Record<FlagKind, LucideIcon> = { paste: ClipboardPaste, big_insert: Wand2, focus_lost: EyeOff, ai_extension: Bot };
export const FLAG_KINDS: FlagKind[] = ["paste", "big_insert", "focus_lost", "ai_extension"];

/** «Вставка: 2× · до 120 симв.», «Ушёл из окна: 3× · 40 с», «ИИ-расширение: GitHub Copilot». */
export function flagText(kind: FlagKind, a: FlagAgg, t: (k: MessageKey, v?: Record<string, string | number>) => string): string {
  const title = t(`flag.${kind}` as MessageKey);
  if (kind === "ai_extension") return `${title}: ${a.detail}`;
  if (kind === "focus_lost") return `${title}: ${t("flag.focusDetail", { count: a.count, value: a.value })}`;
  return `${title}: ${t("flag.pasteDetail", { count: a.count, value: a.value })}`;
}

export const flagCount = (f: PlayerFlags | undefined) => (f ? FLAG_KINDS.reduce((n, k) => n + (f[k] ? 1 : 0), 0) : 0);

/** Значки флагов: иконка + число, подробности во всплывающей подсказке. */
export function FlagBadges({ flags, compact }: { flags?: PlayerFlags; compact?: boolean }) {
  const t = useT();
  if (!flags || flagCount(flags) === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {FLAG_KINDS.filter((k) => flags[k]).map((k) => {
        const a = flags[k]!;
        const Icon = ICON[k];
        return (
          <span
            key={k}
            title={flagText(k, a, t)}
            className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning tabular"
          >
            <Icon size={12} />
            {!compact && k !== "ai_extension" && a.count}
          </span>
        );
      })}
    </span>
  );
}
