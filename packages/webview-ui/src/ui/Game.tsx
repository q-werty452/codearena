import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Crown, Volume2, VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import type { LeaderRow } from "@codearena/shared";
import { cn } from "../lib/cn.ts";
import { useT } from "../lib/i18n.ts";
import { play, soundEnabled, writeState } from "../lib/game.ts";
import { Avatar, teamColor } from "./Avatar.tsx";
import { OptionTile } from "./OptionTile.tsx";
import { TeamIcon } from "./Shapes.tsx";

/* ───────────────────────── Вопрос с плитками ───────────────────────── */

export type TileState = "idle" | "picked" | "correct" | "wrong" | "dim";

export function QuestionView({
  prompt,
  options,
  states,
  onPick,
  stats,
  big,
}: {
  prompt: string;
  options: string[];
  states?: TileState[];
  onPick?: (i: number) => void;
  stats?: number[];
  big?: boolean;
}) {
  const total = stats?.reduce((a, b) => a + b, 0) ?? 0;
  return (
    <div className="flex flex-col gap-5">
      <h2 className={cn("whitespace-pre-wrap text-center font-bold leading-snug", big ? "text-[28px]" : "text-[20px]")}>
        <CodeAwareText text={prompt} />
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {options.map((o, i) => (
          <div key={i} className="relative">
            <OptionTile index={i} state={states?.[i] ?? "idle"} onClick={onPick ? () => onPick(i) : undefined} disabled={!onPick}>
              <CodeAwareText text={o} />
            </OptionTile>
            {stats && (
              <motion.span
                initial={{ opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                className="absolute -right-1.5 -top-1.5 rounded-full border border-border bg-bg px-2 py-0.5 text-[12px] font-bold tabular shadow"
                title={total ? `${Math.round(((stats[i] ?? 0) / total) * 100)}%` : undefined}
              >
                {stats[i] ?? 0}
              </motion.span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Текст, в котором `код в обратных кавычках` и вызовы вида f(x) рисуются моноширинным. */
export function CodeAwareText({ text }: { text: string }) {
  // Блок кода ```…``` (вопросы «что выведет») — отдельным моноширинным блоком, слева.
  if (text.includes("```")) {
    return (
      <>
        {text.split(/(```[^\n`]*\n[\s\S]*?```)/g).map((p, i) =>
          p.startsWith("```") ? (
            <pre
              key={i}
              className="mx-auto my-3 block w-fit max-w-full overflow-x-auto whitespace-pre rounded-[8px] border border-border bg-black/15 px-4 py-3 text-left font-mono text-[14px] font-normal leading-relaxed"
            >
              {p.replace(/^```[^\n`]*\n/, "").replace(/\n?```$/, "")}
            </pre>
          ) : p.trim() ? (
            <CodeAwareText key={i} text={p.trim()} />
          ) : null,
        )}
      </>
    );
  }
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") ? (
          <code key={i} className="rounded-[5px] bg-black/15 px-1 font-mono text-[0.92em]">
            {p.slice(1, -1)}
          </code>
        ) : /[()[\]'"=*]/.test(p) && !/\s{2,}/.test(p) && p.length < 80 && /^[\x20-\x7E]+$/.test(p.trim()) ? (
          <span key={i} className="font-mono">{p}</span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/* ───────────────────────── Отсчёт ───────────────────────── */

export function Countdown({ left, title }: { left: number; title: string }) {
  const t = useT();
  const n = Math.ceil(left);
  const label = n > 0 && n <= 3 ? String(n) : t("game.go");
  useEffect(() => {
    if (n > 0 && n <= 3) play("tick");
    if (n <= 0) play("go");
  }, [n]);
  return (
    <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-4">
      <div className="text-[13px] font-medium text-muted">{title}</div>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={label}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 22 }}
          className="font-bold leading-none text-fg tabular"
          style={{ fontSize: label.length > 2 ? 64 : 120 }}
        >
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ───────────────────────── Таблица лидеров ───────────────────────── */

export function Leaderboard({ rows, limit = 5, meId, compact }: { rows: LeaderRow[]; limit?: number; meId?: string; compact?: boolean }) {
  const shown = rows.slice(0, limit);
  const me = meId ? rows.findIndex((r) => r.id === meId) : -1;
  return (
    <LayoutGroup>
      <ol className="flex flex-col gap-1.5">
        {shown.map((r, i) => (
          <LeaderLine key={r.id} row={r} place={i + 1} me={r.id === meId} compact={compact} />
        ))}
        {me >= limit && (
          <>
            <li className="text-center text-muted">···</li>
            <LeaderLine row={rows[me]!} place={me + 1} me compact={compact} />
          </>
        )}
      </ol>
    </LayoutGroup>
  );
}

function LeaderLine({ row, place, me, compact }: { row: LeaderRow; place: number; me?: boolean; compact?: boolean }) {
  return (
    <motion.li
      layout
      transition={{ type: "spring", stiffness: 500, damping: 40 }}
      className={cn(
        "flex items-center gap-2.5 rounded-[10px] border px-2.5",
        compact ? "h-9" : "h-11",
        me ? "border-accent bg-accent/10" : "border-border bg-surface",
      )}
    >
      <span className={cn("w-5 text-center font-bold tabular", place <= 3 ? "text-fg" : "text-muted")}>{place}</span>
      <Avatar name={row.name} team={row.team} size={compact ? 22 : 26} />
      <span className="min-w-0 flex-1 truncate font-medium">{row.name}</span>
      <span className="font-bold tabular">{row.score}</span>
    </motion.li>
  );
}

/* ───────────────────────── Пьедестал ───────────────────────── */

export function Podium({ rows }: { rows: LeaderRow[] }) {
  const reduce = useReducedMotion();
  const order = [1, 0, 2]; // 2-е, 1-е, 3-е место
  const heights = [96, 132, 72];
  return (
    <div className="flex items-end justify-center gap-3 pt-6">
      {order.map((idx, col) => {
        const r = rows[idx];
        if (!r) return <div key={col} className="w-[110px]" />;
        return (
          <motion.div
            key={r.id}
            initial={reduce ? { opacity: 0 } : { y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: reduce ? 0 : [0.5, 0.9, 0.2][col], type: "spring", stiffness: 260, damping: 24 }}
            className="flex w-[110px] flex-col items-center gap-2"
          >
            {idx === 0 && <Crown size={22} className="text-warning" fill="currentColor" />}
            <Avatar name={r.name} team={r.team} size={idx === 0 ? 52 : 42} />
            <div className="w-full truncate text-center text-[13px] font-semibold">{r.name}</div>
            <div className="text-[12px] font-bold text-muted tabular">{r.score}</div>
            <div
              className="flex w-full items-start justify-center rounded-t-[12px] pt-2 text-[28px] font-bold text-white"
              style={{
                height: heights[col],
                background: idx === 0 ? "var(--ca-accent)" : "color-mix(in srgb, var(--ca-accent) 55%, var(--ca-surface-2))",
              }}
            >
              {idx + 1}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Счёт команд ───────────────────────── */

export function TeamScores({ scores, names }: { scores: number[]; names: string[] }) {
  if (scores.length === 0) return null;
  const max = Math.max(1, ...scores);
  return (
    <div className="flex flex-col gap-2">
      {scores.map((s, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-white" style={{ background: teamColor(i) }}>
            <TeamIcon team={i} size={12} />
          </span>
          <span className="w-24 truncate text-[13px] font-medium">{names[i]}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <motion.div className="h-full rounded-full" style={{ background: teamColor(i) }} animate={{ width: `${(s / max) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
          </div>
          <span className="w-12 text-right font-bold tabular">{s}</span>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────── Звук ───────────────────────── */

export function SoundToggle() {
  const t = useT();
  const [on, setOn] = useState(soundEnabled);
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      onClick={() => {
        writeState({ sound: !on });
        setOn(!on);
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-[8px] px-2 text-[12px] text-muted transition-colors hover:bg-hover hover:text-fg"
      aria-pressed={on}
      title={t("sound.on")}
    >
      <Icon size={15} />
      {t("sound.on")}
    </button>
  );
}
