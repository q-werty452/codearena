import type { GameSnapshot, SessionSnapshot } from "@codearena/shared";
import { FLAG_KINDS, flagText } from "../ui/Flags.tsx";
import type { Locale, MessageKey } from "./i18n.ts";

/**
 * Итоги игры в CSV для журнала. Для русского Excel разделитель — «;»,
 * для английского — «,». BOM добавляет расширение при сохранении.
 */
export function resultsCsv(g: GameSnapshot, session: SessionSnapshot, locale: Locale, t: (k: MessageKey, v?: Record<string, string | number>) => string): { fileName: string; content: string } {
  const sep = locale === "ru" ? ";" : ",";
  const cell = (v: string | number) => {
    const s = String(v);
    return /[";,\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const teams = new Map((session.lobby?.teams ?? []).map((x) => [x.index, x.name]));
  const header = [t("csv.place"), t("csv.name"), t("csv.team"), t("csv.score"), g.kind === "race" ? t("race.length") : t("csv.progress"), t("csv.flags")];
  const rows = g.leaders.map((l, i) => {
    const f = g.flags[l.id];
    const flags = f ? FLAG_KINDS.filter((k) => f[k]).map((k) => flagText(k, f[k]!, t)).join("; ") : "";
    return [i + 1, l.name, l.team !== null ? (teams.get(l.team) ?? "") : "", l.score, l.progress, flags];
  });
  const content = [header, ...rows].map((r) => r.map(cell).join(sep)).join("\r\n") + "\r\n";
  const date = new Date().toISOString().slice(0, 10);
  return { fileName: `CodeArena-${date}-${g.kind}-${session.code ?? "room"}.csv`, content };
}
