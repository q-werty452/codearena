import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ClipboardPaste, ExternalLink, FileUp, KeyRound, Loader2, Sparkles, Wand2, X, type LucideIcon } from "lucide-react";
import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AI_KEY_URL,
  aiTaskTypes,
  distribute,
  parseTasksText,
  RUNNABLE_LANGUAGES,
  type AiRequest,
  type Difficulty,
  type GameKind,
  type ImportResult,
  type Language,
  type SkippedTask,
  type Task,
} from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card } from "../../ui/Card.tsx";
import { Segmented } from "../../ui/Controls.tsx";
import { ExternalA } from "../../ui/ExternalA.tsx";
import { cn } from "../../lib/cn.ts";
import { LocaleContext, useT, type MessageKey } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { readUiState, writeState } from "../../lib/game.ts";
import { countsByGame, showImportResult, useMyTasks } from "../../lib/myTasks.ts";
import { GAMES } from "./GamePicker.tsx";

/* ───────────────────────── Общее окно ───────────────────────── */

export function Modal({ open, onClose, icon: Icon, title, hint, children, width = 600 }: { open: boolean; onClose: () => void; icon: LucideIcon; title: ReactNode; hint?: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/45 p-4 backdrop-blur-[2px] sm:p-6" onClick={onClose}>
          <motion.div
            initial={{ y: 16, scale: 0.98 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: 16, scale: 0.98 }}
            transition={{ duration: 0.18 }}
            className="mt-6 w-full rounded-card border border-border bg-[var(--vscode-editor-background,var(--ca-bg))] p-5 shadow-2xl sm:mt-10"
            style={{ maxWidth: width }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface-2 text-muted">
                <Icon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[18px] font-semibold leading-tight">{title}</h2>
                {hint && <p className="mt-0.5 text-[12px] text-muted">{hint}</p>}
              </div>
              <button onClick={onClose} className="flex size-8 shrink-0 items-center justify-center rounded-[8px] text-muted hover:bg-hover hover:text-fg" aria-label="close">
                <X size={16} />
              </button>
            </div>
            <div className="mt-4">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const gameMeta = (g: GameKind) => GAMES.find((x) => x.kind === g)!;

/** Значок игры с цветом — как на карточках выбора игры. */
export function GameIcon({ game, size = 30 }: { game: GameKind; size?: number }) {
  const { icon: Icon, color } = gameMeta(game);
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[9px] text-white" style={{ background: color, width: size, height: size }}>
      <Icon size={size * 0.55} strokeWidth={2.3} />
    </span>
  );
}

function SkippedList({ skipped }: { skipped: SkippedTask[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!skipped.length) return null;
  return (
    <div className="rounded-btn border border-warning/40 bg-warning/5 px-3 py-2.5 text-[13px]">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 text-left font-semibold text-warning">
        <AlertTriangle size={15} />
        {t("imp.skipped", { n: skipped.length })}
        <span className="ml-auto text-[12px] font-normal text-muted">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-2 flex max-h-40 flex-col gap-1 overflow-y-auto text-[12px]">
          {skipped.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted">{s.where}</span>
              <span>
                {t(`skip.${s.reason}` as MessageKey)}
                {s.detail && <span className="break-all font-mono text-[11px] text-muted"> · {s.detail}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ───────────────────────── Итог загрузки ───────────────────────── */

/** «Задания разложены по играм»: сколько куда попало, кнопка «Открыть» у каждой игры. */
export function ImportResultDialog({ result, onClose, onOpenGame }: { result: ImportResult | null; onClose: () => void; onOpenGame: (g: GameKind) => void }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const { ai } = useMyTasks();
  const games = result ? (Object.entries(result.byGame) as [GameKind, Task[]][]).filter(([, ts]) => ts.length) : [];
  const total = games.reduce((n, [, ts]) => n + ts.length, 0);
  return (
    <Modal
      open={!!result}
      onClose={onClose}
      icon={result?.source === "ai" ? Sparkles : FileUp}
      title={result?.unrecognized ? t("imp.unrecognized") : result?.source === "ai" ? t("imp.titleAi") : t("imp.title")}
      hint={result?.fileName ? t("imp.from", { file: result.fileName }) : undefined}
      width={560}
    >
      {result?.unrecognized ? (
        <div className="flex flex-col gap-3">
          <p className="text-[14px]">{t("imp.unrecognizedHint")}</p>
          <p className="rounded-btn bg-surface px-3 py-2 text-[12px] text-muted">{t("imp.formatHint")}</p>
          <div className="flex justify-end gap-2">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button
              variant="primary"
              icon={<Wand2 size={15} />}
              loading={ai.busy}
              onClick={() => host.post({ type: "ai_generate", req: { mode: "extract", game: "quiz", language: "html", topic: "", count: 20, difficulty: "easy", locale } })}
            >
              {t("imp.parseAi")}
            </Button>
          </div>
          {ai.busy && <AiProgress />}
          {ai.error && !ai.busy && <AiErrorLine />}
        </div>
      ) : (
        result && (
          <div className="flex flex-col gap-3">
            {games.length === 0 && <p className="py-4 text-center text-muted">{t("imp.nothing")}</p>}
            <ul className="flex flex-col gap-2">
              {games.map(([g, ts], i) => (
                <motion.li
                  key={g}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.06 }}
                  className="flex items-center gap-3 rounded-card border border-border bg-surface px-3 py-2.5"
                >
                  <GameIcon game={g} />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-semibold">{t(`game.${g}` as MessageKey)}</div>
                    <div className="text-[12px] text-muted">
                      {t.count("task", ts.length)} · {t("imp.added")}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => onOpenGame(g)}>
                    {t("imp.open")}
                  </Button>
                </motion.li>
              ))}
            </ul>
            {total > 0 && <p className="text-[12px] text-muted">✓ {t("imp.saved")}</p>}
            {!!result.unverified && <p className="text-[12px] text-warning">{t("imp.unverified", { n: result.unverified })}</p>}
            <SkippedList skipped={result.skipped} />
            <div className="flex justify-end">
              <Button variant="primary" onClick={onClose}>
                {t("imp.done")}
              </Button>
            </div>
          </div>
        )
      )}
    </Modal>
  );
}

/* ───────────────────────── Вставить текст ───────────────────────── */

/** Вопросы из буфера: разбираются прямо здесь, видно, сколько нашлось и куда пойдут. */
export function PasteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT();
  const [text, setText] = useState("");
  const parsed = useMemo(() => (text.trim() ? parseTasksText(text) : null), [text]);
  const counts = parsed ? countsByGame(parsed.tasks) : {};
  const n = parsed?.tasks.length ?? 0;
  const add = () => {
    if (!parsed || !n) return;
    const title = parsed.title || parsed.tasks[0]!.topic;
    host.post({ type: "my_tasks_add", title, tasks: parsed.tasks });
    showImportResult({ source: "paste", title, byGame: distribute(parsed.tasks, parsed.game), skipped: parsed.skipped });
    setText("");
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} icon={ClipboardPaste} title={t("paste.title")} hint={t("my.pasteHint")} width={680}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t("paste.example")}
        spellCheck={false}
        className="h-64 w-full resize-y rounded-btn border border-border bg-input p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--ca-focus)]"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-muted">{n ? `${t("paste.found")}:` : t("paste.none")}</span>
        {(Object.entries(counts) as [GameKind, number][]).map(([g, c]) => (
          <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface py-0.5 pl-0.5 pr-2.5 text-[12px] font-semibold">
            <GameIcon game={g} size={20} />
            {t(`game.${g}` as MessageKey)} · {c}
          </span>
        ))}
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" disabled={!n} onClick={add}>
            {t("paste.add", { n })}
          </Button>
        </div>
      </div>
      {parsed && parsed.skipped.length > 0 && (
        <div className="mt-3">
          <SkippedList skipped={parsed.skipped} />
        </div>
      )}
      <p className="mt-3 text-[12px] text-muted">{t("imp.formatHint")}</p>
    </Modal>
  );
}

/* ───────────────────────── ИИ ───────────────────────── */

const LANGS: { value: Language; label: string }[] = [
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "javascript", label: "JS" },
  { value: "python", label: "Python" },
  { value: "dart", label: "Dart" },
];
const AI_GAMES: AiRequest["game"][] = ["quiz", "bug", "tug", "codewars", "race"];

function AiProgress() {
  const t = useT();
  const { ai } = useMyTasks();
  if (!ai.busy) return null;
  const pct = ai.stage === "verify" && ai.total ? (ai.done ?? 0) / ai.total : ai.stage === "generate" ? 0.35 : ai.stage === "repair" ? 0.8 : 0.1;
  return (
    <div className="rounded-btn border border-border bg-surface px-3 py-3">
      <div className="flex items-center gap-2 text-[13px] font-semibold">
        <Loader2 size={15} className="animate-spin text-muted" />
        {t(`ai.stage.${ai.stage ?? "model"}` as MessageKey, { done: ai.done ?? 0, total: ai.total ?? 0 })}
        <button onClick={() => host.post({ type: "ai_cancel" })} className="ml-auto text-[12px] font-normal text-muted hover:text-fg">
          {t("ai.cancel")}
        </button>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <motion.div className="h-full rounded-full bg-accent" animate={{ width: `${Math.round(pct * 100)}%` }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>
      {ai.model && <div className="mt-1.5 font-mono text-[11px] text-muted">{t("ai.model", { m: ai.model })}</div>}
    </div>
  );
}

function AiErrorLine() {
  const t = useT();
  const { ai } = useMyTasks();
  if (!ai.error) return null;
  return (
    <div className="flex items-start gap-2 rounded-btn border border-error/40 bg-error/5 px-3 py-2.5 text-[13px] text-error">
      <AlertTriangle size={15} className="mt-0.5 shrink-0" />
      <div>
        {t(`ai.err.${ai.error}` as MessageKey)}
        {ai.errorDetail && ai.error !== "cancelled" && <div className="mt-0.5 break-words font-mono text-[11px] text-muted">{ai.errorDetail}</div>}
      </div>
    </div>
  );
}

/** «Задания с ИИ»: игра, язык, тема, количество, сложность, материал урока. */
export function AiDialog({ open, game, onClose }: { open: boolean; game: AiRequest["game"]; onClose: () => void }) {
  const t = useT();
  const locale = useContext(LocaleContext);
  const { ai } = useMyTasks();
  const saved = readUiState().aiForm;
  const [g, setG] = useState<AiRequest["game"]>(game);
  const [language, setLanguage] = useState<Language>((saved?.language as Language) ?? "html");
  const [topic, setTopic] = useState(saved?.topic ?? "");
  const [count, setCount] = useState(saved?.count ?? 8);
  const [difficulty, setDifficulty] = useState<Difficulty>((saved?.difficulty as Difficulty) ?? "easy");
  const [material, setMaterial] = useState("");
  useEffect(() => { setG(game); }, [game, open]);
  useEffect(() => { writeState({ aiForm: { language, topic, count, difficulty } }); }, [language, topic, count, difficulty]);

  const noTypes = aiTaskTypes(g, language).length === 0;
  const canGo = ai.hasKey && !ai.busy && !noTypes && (topic.trim().length > 1 || material.trim().length > 20);
  const go = () => host.post({ type: "ai_generate", req: { mode: "generate", game: g, language, topic: topic.trim(), count, difficulty, material: material.trim() || undefined, locale } });

  return (
    <Modal open={open} onClose={onClose} icon={Wand2} title={t("ai.title")} hint={t("ai.hint")} width={640}>
      {!ai.hasKey ? (
        <Card className="mb-4 flex flex-wrap items-center gap-3 p-4">
          <KeyRound size={20} className="text-muted" />
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold">{t("ai.noKey")}</div>
            <div className="text-[12px] text-muted">{t("ai.noKeyHint")}</div>
          </div>
          <ExternalA href={AI_KEY_URL} className="inline-flex items-center gap-1 text-[13px] font-semibold text-link hover:underline">
            {t("ai.getKey")} <ExternalLink size={12} />
          </ExternalA>
          <Button variant="primary" size="sm" icon={<KeyRound size={14} />} onClick={() => host.post({ type: "ai_set_key" })}>
            {t("ai.setKey")}
          </Button>
        </Card>
      ) : null}

      <div className={cn("flex flex-col gap-4", !ai.hasKey && "pointer-events-none opacity-50")}>
        <Field label={t("ai.game")}>
          <div className="flex flex-wrap gap-1.5">
            {AI_GAMES.map((x) => (
              <button
                key={x}
                onClick={() => setG(x)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-btn border py-1 pl-1 pr-3 text-[13px] font-semibold transition-colors",
                  g === x ? "border-accent bg-accent/10" : "border-border bg-surface hover:bg-surface-2",
                )}
              >
                <GameIcon game={x} size={26} />
                {t(`game.${x}` as MessageKey)}
              </button>
            ))}
          </div>
        </Field>
        <div className="flex flex-wrap gap-4">
          <Field label={t("ai.language")}>
            <Segmented<Language> value={language} onChange={setLanguage} options={LANGS.map((l) => ({ ...l, disabled: aiTaskTypes(g, l.value).length === 0 }))} />
          </Field>
          <Field label={t("ai.count")}>
            <Segmented<string> value={String(count)} onChange={(v) => setCount(Number(v))} options={[5, 8, 12, 16].map((n) => ({ value: String(n), label: String(n) }))} />
          </Field>
          <Field label={t("ai.difficulty")}>
            <Segmented<Difficulty> value={difficulty} onChange={setDifficulty} options={(["easy", "medium", "hard"] as const).map((d) => ({ value: d, label: t(`ai.${d}`) }))} />
          </Field>
        </div>
        {!RUNNABLE_LANGUAGES.has(language) && <p className="-mt-2 text-[12px] text-muted">{t("ai.noRun")}</p>}
        <Field label={t("ai.topic")}>
          <input
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canGo && go()}
            placeholder={t("ai.topicPlaceholder")}
            maxLength={300}
            className="h-10 w-full rounded-btn border border-border bg-input px-3 text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
        </Field>
        <Field label={t("ai.material")}>
          <textarea
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            placeholder={t("ai.materialPlaceholder")}
            maxLength={40_000}
            className="h-24 w-full resize-y rounded-btn border border-border bg-input p-3 text-[13px] outline-none focus:border-[var(--ca-focus)]"
          />
        </Field>
        <AiProgress />
        {!ai.busy && <AiErrorLine />}
        <div className="flex flex-wrap items-center gap-2">
          {ai.hasKey && (
            <button onClick={() => host.post({ type: "ai_set_key" })} className="inline-flex items-center gap-1 text-[12px] text-muted hover:text-fg">
              <KeyRound size={12} /> {t("ai.changeKey")}
            </button>
          )}
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>{t("common.cancel")}</Button>
            <Button variant="primary" icon={<Sparkles size={15} />} disabled={!canGo} loading={ai.busy} onClick={go}>
              {t("ai.generate")}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-muted">{label}</span>
      {children}
    </label>
  );
}

/* ───────────────────────── Карточка на экране выбора игры ───────────────────────── */

/** «Мои задания»: загрузить файл, вставить текст, создать с ИИ + что уже есть. */
export function MyTasksCard({ onPaste, onAi }: { onPaste: () => void; onAi: () => void }) {
  const t = useT();
  const { sets } = useMyTasks();
  const all = sets.flatMap((s) => s.tasks);
  const counts = countsByGame(all) as Partial<Record<GameKind, number>>;
  const actions: { icon: LucideIcon; title: MessageKey; hint: MessageKey; onClick: () => void; accent?: boolean }[] = [
    { icon: FileUp, title: "my.import", hint: "my.importHint", onClick: () => host.post({ type: "import_tasks" }) },
    { icon: ClipboardPaste, title: "my.paste", hint: "my.pasteHint", onClick: onPaste },
    { icon: Wand2, title: "my.ai", hint: "my.aiHint", onClick: onAi, accent: true },
  ];
  return (
    <Card className="p-5">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h2 className="text-[14px] font-semibold">{t("my.title")}</h2>
        {all.length > 0 && <span className="text-[12px] text-muted">· {t.count("task", all.length)}</span>}
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(Object.entries(counts) as [GameKind, number][]).map(([g, c]) => (
            <span key={g} className="inline-flex items-center gap-1.5 rounded-full border border-border py-0.5 pl-0.5 pr-2 text-[11px] font-semibold" title={t(`game.${g}` as MessageKey)}>
              <GameIcon game={g} size={18} />
              {c}
            </span>
          ))}
        </div>
      </div>
      <p className="mb-4 text-[12px] text-muted">{all.length ? t("my.hint") : t("my.empty")}</p>
      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))]">
        {actions.map(({ icon: Icon, title, hint, onClick, accent }) => (
          <motion.button
            key={title}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClick}
            className={cn(
              "flex items-start gap-3 rounded-card border p-3.5 text-left transition-colors",
              accent ? "border-accent/50 bg-accent/[0.07] hover:border-accent" : "border-border bg-surface-2/40 hover:border-[var(--ca-accent)]",
            )}
          >
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-[10px]", accent ? "bg-accent text-on-accent" : "bg-surface-2 text-fg")}>
              <Icon size={18} />
            </span>
            <span>
              <span className="block text-[14px] font-semibold">{t(title)}</span>
              <span className="mt-0.5 block text-[12px] text-muted">{t(hint)}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </Card>
  );
}
