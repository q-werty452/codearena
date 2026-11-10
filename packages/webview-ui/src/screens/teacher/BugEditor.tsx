import { AnimatePresence, motion } from "motion/react";
import { AlertTriangle, ArrowLeft, Check, Copy, FlaskConical, FolderOpen, Library, Play, Plus, Save, Search, Sparkles, Trash2, Wrench, X, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { OPTION_SHAPES, type HostToUi, type HtmlRule, type Language, type Task, type TaskSet, type TestResult } from "@codearena/shared";
import { Button } from "../../ui/Button.tsx";
import { Card } from "../../ui/Card.tsx";
import { Segmented } from "../../ui/Controls.tsx";
import { ClickableCode } from "../../ui/Code.tsx";
import { Shape } from "../../ui/Shapes.tsx";
import { cn } from "../../lib/cn.ts";
import { useT, type MessageKey } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { onHostMessage } from "../../lib/vscode.ts";

type FindT = Extract<Task, { type: "find_line" }>;
type FixT = Extract<Task, { type: "fix_bug" }>;
type BestT = Extract<Task, { type: "best_variant" }>;
export type BugTask = FindT | FixT | BestT;

const SHOW_LANGS: Language[] = ["html", "css", "javascript", "python", "dart"];
const RUN_LANGS: Language[] = ["html", "css", "javascript", "python", "dart"];
const LANG_LABEL: Record<Language, string> = { html: "HTML", css: "CSS", javascript: "JS", python: "Python", dart: "Dart" };
const isRules = (l: Language) => l === "html" || l === "css";
const FIX_TIMES = [60, 120, 180, 300] as const;
const Q_TIMES = [10, 20, 30, 60] as const;

export function blankBug(type: BugTask["type"], language: Language = "html"): BugTask {
  const base = { topic: "", difficulty: "easy" as const, timeLimitSec: 120, explanation: "", prompt: "" };
  if (type === "find_line") return { ...base, type, language, code: "", line: 0 as unknown as number };
  if (type === "best_variant") return { ...base, type, language, variants: ["", ""], correct: 0 };
  return { ...base, type, language: RUN_LANGS.includes(language) ? language : "html", code: "", tests: [], rules: [], solution: "" };
}

export function bugError(q: BugTask): MessageKey | null {
  if (q.type === "find_line") {
    if (!q.code.trim()) return "bug.errCode";
    if (!(q.line >= 1 && q.line <= q.code.split("\n").length)) return "bug.errLine";
  } else if (q.type === "best_variant") {
    if (q.variants.filter((v) => v.trim()).length < 2 || !q.variants[q.correct]?.trim()) return "bug.errVariants";
  } else {
    if (!q.code.trim()) return "bug.errCode";
    const has = isRules(q.language) ? q.rules.length > 0 : q.tests.some((x) => x.call.trim() && x.expected.trim());
    if (!has) return "bug.errChecks";
  }
  return null;
}

/** Подготовка к старту: пустые варианты убрать, подсказку по умолчанию — на языке учителя. */
function cleanBug(q: BugTask, topic: string, t: (k: MessageKey) => string): BugTask {
  const prompt = q.prompt.trim() || t(q.type === "find_line" ? "bug.findHint" : q.type === "fix_bug" ? "bug.fix" : "bug.bestHint");
  const common = { topic: q.topic || topic || "Find the bug", prompt, explanation: q.explanation?.trim() || undefined };
  if (q.type === "best_variant") {
    const keep = q.variants.map((v, i) => ({ v: v.trimEnd(), i })).filter((x) => x.v.trim());
    return { ...q, ...common, variants: keep.map((x) => x.v), correct: Math.max(0, keep.findIndex((x) => x.i === q.correct)) };
  }
  if (q.type === "fix_bug") {
    return { ...q, ...common, tests: q.tests.filter((x) => x.call.trim() && x.expected.trim()), solution: q.solution?.trim() || undefined };
  }
  return { ...q, ...common };
}

export function BugEditor({
  set,
  onChange,
  questionSec,
  onQuestionSec,
  onBack,
  onStart,
  onSample,
  onBank,
  onAi,
  onLoad,
  onSave,
}: {
  set: TaskSet;
  onChange: (s: TaskSet) => void;
  questionSec: number;
  onQuestionSec: (n: number) => void;
  onBack: () => void;
  onStart: (tasks: Task[]) => void;
  onSample: () => void;
  onBank: () => void;
  onAi?: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const tasks = set.tasks.filter((x): x is BugTask => x.type === "find_line" || x.type === "fix_bug" || x.type === "best_variant");
  const errors = tasks.map(bugError);
  const bad = errors.filter(Boolean).length;
  const update = (next: BugTask[]) => onChange({ ...set, tasks: next });
  const patch = (i: number, p: Partial<BugTask>) => update(tasks.map((q, k) => (k === i ? ({ ...q, ...p } as BugTask) : q)));
  const lastLang = tasks[tasks.length - 1]?.language ?? "html";
  const add = (type: BugTask["type"]) => update([...tasks, blankBug(type, lastLang)]);

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
            {t("pick.title")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" icon={<Library size={14} />} onClick={onBank}>
              {t("bank.open")}
            </Button>
            {onAi && (
              <Button size="sm" icon={<Wand2 size={14} />} onClick={onAi}>
                {t("ai.short")}
              </Button>
            )}
            <Button size="sm" icon={<Sparkles size={14} />} onClick={onSample}>
              {t("edit.sample")}
            </Button>
            <Button size="sm" icon={<FolderOpen size={14} />} onClick={onLoad}>
              {t("edit.load")}
            </Button>
            <Button size="sm" icon={<Save size={14} />} onClick={onSave} disabled={tasks.length === 0}>
              {t("edit.save")}
            </Button>
          </div>
        </div>

        <div>
          <h1 className="text-title font-bold">{t("bug.editTitle")}</h1>
          <input
            value={set.title}
            onChange={(e) => onChange({ ...set, title: e.target.value })}
            placeholder={t("edit.setTitlePlaceholder")}
            aria-label={t("edit.setTitle")}
            maxLength={80}
            className="mt-2 h-9 w-full max-w-[420px] rounded-btn border border-border bg-input px-3 text-[14px] outline-none focus:border-[var(--ca-focus)]"
          />
        </div>

        {tasks.length === 0 ? (
          <Card className="flex flex-col items-center gap-3 border-dashed px-6 py-14 text-center">
            <div className="text-[16px] font-semibold">{t("edit.empty")}</div>
            <p className="text-muted">{t("edit.emptyHint")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<Library size={14} />} onClick={onBank}>
                {t("bank.open")}
              </Button>
              <AddButtons onAdd={add} />
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {tasks.map((q, i) => (
                <BugCard
                  key={i}
                  n={i + 1}
                  q={q}
                  error={errors[i] ?? null}
                  onChange={(p) => patch(i, p)}
                  onDuplicate={() => {
                    const next = [...tasks];
                    next.splice(i + 1, 0, structuredClone(q));
                    update(next);
                  }}
                  onDelete={() => update(tasks.filter((_, k) => k !== i))}
                />
              ))}
            </AnimatePresence>
            <div className="flex flex-wrap gap-2">
              <AddButtons onAdd={add} />
            </div>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-3 px-6 py-3">
          <label className="flex items-center gap-2">
            <span className="text-[12px] text-muted">{t("edit.time")}</span>
            <Segmented<string> value={String(questionSec)} onChange={(v) => onQuestionSec(Number(v))} options={Q_TIMES.map((n) => ({ value: String(n), label: t("edit.sec", { n }) }))} />
          </label>
          <div className="flex items-center gap-3">
            {tasks.length > 0 && <span className={cn("text-[12px]", bad ? "text-warning" : "text-muted")}>{bad ? t("tug.notReady", { n: bad }) : t("bug.ready", { n: tasks.length })}</span>}
            <Button variant="primary" size="lg" icon={<Play size={18} />} disabled={tasks.length === 0 || bad > 0} onClick={() => onStart(tasks.map((q) => cleanBug(q, set.title, t)))}>
              {t("common.start")}
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}

function AddButtons({ onAdd }: { onAdd: (type: BugTask["type"]) => void }) {
  const t = useT();
  return (
    <>
      <Button icon={<Search size={14} />} onClick={() => onAdd("find_line")}>
        {t("bug.addFind")}
      </Button>
      <Button icon={<Wrench size={14} />} onClick={() => onAdd("fix_bug")}>
        {t("bug.addFix")}
      </Button>
      <Button icon={<Check size={14} />} onClick={() => onAdd("best_variant")}>
        {t("bug.addBest")}
      </Button>
    </>
  );
}

const area = "w-full resize-y rounded-btn border border-border bg-input px-3 py-2 font-mono text-[13px] leading-[1.5] outline-none focus:border-[var(--ca-focus)]";
const field = "h-8 rounded-[8px] border border-border bg-input px-2 text-[13px] outline-none focus:border-[var(--ca-focus)]";

function BugCard({ n, q, error, onChange, onDuplicate, onDelete }: { n: number; q: BugTask; error: MessageKey | null; onChange: (p: Partial<BugTask>) => void; onDuplicate: () => void; onDelete: () => void }) {
  const t = useT();
  const kindKey: MessageKey = q.type === "find_line" ? "bug.find" : q.type === "fix_bug" ? "bug.fix" : "bug.best";
  const langs = q.type === "fix_bug" ? RUN_LANGS : SHOW_LANGS;
  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} className="rounded-card border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tabular text-muted">{n}</span>
        <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-[12px] font-semibold text-warning">{t(kindKey)}</span>
        <Segmented<Language> value={q.language} onChange={(language) => onChange({ language } as Partial<BugTask>)} options={langs.map((l) => ({ value: l, label: LANG_LABEL[l] }))} />
        {q.type === "fix_bug" && (
          <Segmented<string> value={String(q.timeLimitSec)} onChange={(v) => onChange({ timeLimitSec: Number(v) })} options={FIX_TIMES.map((s) => ({ value: String(s), label: t("tug.min", { n: s / 60 }) }))} />
        )}
        {error && <span className="text-[12px] text-warning">{t(error)}</span>}
        <div className="ml-auto flex">
          <button type="button" title={t("edit.duplicate")} onClick={onDuplicate} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
            <Copy size={14} />
          </button>
          <button type="button" title={t("edit.delete")} onClick={onDelete} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-error/10 hover:text-error">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <input
        value={q.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder={t(q.type === "find_line" ? "bug.findHint" : q.type === "fix_bug" ? "bug.fix" : "bug.bestHint")}
        maxLength={300}
        className="h-9 w-full rounded-btn border border-border bg-input px-3 text-[14px] font-semibold outline-none focus:border-[var(--ca-focus)]"
      />

      <div className="mt-3">
        {q.type === "find_line" && <FindFields q={q} onChange={onChange} />}
        {q.type === "best_variant" && <BestFields q={q} onChange={onChange} />}
        {q.type === "fix_bug" && <FixFields q={q} onChange={onChange} />}
      </div>

      <input
        value={q.explanation ?? ""}
        onChange={(e) => onChange({ explanation: e.target.value })}
        placeholder={t("edit.explanation")}
        maxLength={400}
        className="mt-3 h-9 w-full rounded-btn border border-dashed border-border bg-transparent px-3 text-[13px] outline-none placeholder:text-muted/70 focus:border-solid focus:border-[var(--ca-focus)]"
      />
    </motion.div>
  );
}

function FindFields({ q, onChange }: { q: FindT; onChange: (p: Partial<FindT>) => void }) {
  const t = useT();
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
      <div>
        <label className="text-[12px] font-medium text-muted">{t("bug.code")}</label>
        <textarea rows={7} value={q.code} onChange={(e) => onChange({ code: e.target.value })} spellCheck={false} className={cn(area, "mt-1")} />
      </div>
      <div>
        <label className="text-[12px] font-medium text-muted">{q.line >= 1 ? t("bug.line", { n: q.line }) : t("bug.pickLine")}</label>
        <div className="mt-1">{q.code.trim() ? <ClickableCode code={q.code} lang={q.language} onPick={(line) => onChange({ line })} marked={q.line} /> : null}</div>
      </div>
    </div>
  );
}

function BestFields({ q, onChange }: { q: BestT; onChange: (p: Partial<BestT>) => void }) {
  const t = useT();
  return (
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))]">
      {q.variants.map((v, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChange({ correct: i })}
              title={t("bug.markBest")}
              className={cn("relative flex size-7 items-center justify-center rounded-[8px] text-white", q.correct === i && "ring-2 ring-success ring-offset-2 ring-offset-[var(--ca-surface)]")}
              style={{ background: `var(--ca-opt-${i})` }}
            >
              <Shape shape={OPTION_SHAPES[i]!} size={12} />
            </button>
            <span className="text-[12px] font-medium text-muted">{t("bug.variant", { n: i + 1 })}</span>
            {q.correct === i && <Check size={14} className="text-success" strokeWidth={3} />}
            {q.variants.length > 2 && (
              <button type="button" onClick={() => onChange({ variants: q.variants.filter((_, k) => k !== i), correct: q.correct === i ? 0 : q.correct > i ? q.correct - 1 : q.correct })} className="ml-auto text-muted hover:text-fg">
                <X size={13} />
              </button>
            )}
          </div>
          <textarea rows={4} value={v} onChange={(e) => onChange({ variants: q.variants.map((x, k) => (k === i ? e.target.value : x)) })} spellCheck={false} className={cn(area, q.correct === i && "border-success/50")} />
        </div>
      ))}
      {q.variants.length < 4 && (
        <button type="button" onClick={() => onChange({ variants: [...q.variants, ""] })} className="flex min-h-[100px] items-center justify-center gap-1.5 rounded-btn border border-dashed border-border text-[12px] text-muted hover:text-fg">
          <Plus size={13} /> {t("bug.addVariant")}
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── Исправь баг: код, проверки, проверка задания ───────────────────────── */

type RuleKind = "exists" | "absent" | "attr" | "count" | "text" | "css" | "cssAbsent";

function ruleKind(r: HtmlRule): RuleKind {
  if (r.css) return r.exists ? "css" : "cssAbsent";
  if (!r.exists) return "absent";
  if (r.everyHasAttr) return "attr";
  if (r.minCount) return "count";
  if (r.text !== undefined) return "text";
  return "exists";
}

function makeRule(kind: RuleKind, base: HtmlRule): HtmlRule {
  const r: HtmlRule = { selector: base.selector, label: base.label, exists: !(kind === "absent" || kind === "cssAbsent") };
  if (kind === "attr") r.everyHasAttr = base.everyHasAttr ?? "alt";
  if (kind === "count") r.minCount = base.minCount ?? 2;
  if (kind === "text") r.text = base.text ?? "";
  if (kind === "css" || kind === "cssAbsent") r.css = base.css ?? { property: "display", value: kind === "css" ? "flex" : undefined };
  return r;
}

function useCheck() {
  const [state, setState] = useState<{ running: boolean; broken?: TestResult[] | null; fixed?: TestResult[] | null; error?: string | null }>({ running: false });
  const pending = useRef<Record<string, "broken" | "fixed">>({});
  useEffect(
    () =>
      onHostMessage<HostToUi>((m) => {
        if (m.type !== "check_result" || !pending.current[m.requestId]) return;
        const which = pending.current[m.requestId]!;
        delete pending.current[m.requestId];
        setState((s) => ({ ...s, [which]: m.results, error: m.error ?? s.error, running: Object.keys(pending.current).length > 0 }));
      }),
    [],
  );
  const run = (q: FixT) => {
    pending.current = {};
    setState({ running: true, broken: null, fixed: null, error: null });
    const checks = { tests: q.tests.filter((x) => x.call.trim() && x.expected.trim()), rules: q.rules };
    for (const [which, code] of [["broken", q.code], ["fixed", q.solution ?? ""]] as const) {
      if (!code.trim()) continue;
      const id = Math.random().toString(36).slice(2);
      pending.current[id] = which;
      host.post({ type: "check_code", requestId: id, language: q.language, code, ...checks });
    }
  };
  return { state, run };
}

function FixFields({ q, onChange }: { q: FixT; onChange: (p: Partial<FixT>) => void }) {
  const t = useT();
  const { state, run } = useCheck();
  const brokenPasses = state.broken && state.broken.length > 0 && state.broken.every((r) => r.ok);
  const fixedFails = state.fixed ? state.fixed.filter((r) => !r.ok).length : 0;
  const allGood = !state.running && state.broken && state.fixed && !brokenPasses && fixedFails === 0 && !state.error;

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <div>
          <label className="text-[12px] font-medium text-muted">{t("bug.broken")}</label>
          <textarea rows={6} value={q.code} onChange={(e) => onChange({ code: e.target.value })} spellCheck={false} className={cn(area, "mt-1")} />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted">{t("bug.solution")}</label>
          <textarea rows={6} value={q.solution ?? ""} onChange={(e) => onChange({ solution: e.target.value })} spellCheck={false} className={cn(area, "mt-1")} />
        </div>
      </div>

      <div>
        <label className="text-[12px] font-medium text-muted">{t("bug.rules")}</label>
        {isRules(q.language) ? <RulesEditor rules={q.rules} css={q.language === "css"} onChange={(rules) => onChange({ rules })} results={state.fixed ?? undefined} /> : <TestsEditor tests={q.tests} onChange={(tests) => onChange({ tests })} />}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" icon={<FlaskConical size={14} />} loading={state.running} disabled={!q.code.trim() || !q.solution?.trim()} onClick={() => run(q)}>
          {t("bug.checkTask")}
        </Button>
        {!state.running && (state.broken || state.fixed || state.error) && (
          <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", allGood ? "text-success" : "text-warning")}>
            {allGood ? <Check size={13} /> : <AlertTriangle size={13} />}
            {state.error === "no_python" || state.error === "no_dart"
              ? t(state.error === "no_dart" ? "cw.noDart" : "cw.noPython")
              : state.error
                ? t("cw.compile")
                : brokenPasses
                  ? t("bug.checkBrokenPasses")
                  : fixedFails
                    ? t("bug.checkFixedFails", { n: fixedFails })
                    : t("bug.checkTaskOk")}
          </span>
        )}
      </div>
    </div>
  );
}

export function RulesEditor({ rules, css, onChange, results }: { rules: HtmlRule[]; css: boolean; onChange: (r: HtmlRule[]) => void; results?: TestResult[] }) {
  const t = useT();
  const kinds: RuleKind[] = css ? ["css", "cssAbsent"] : ["exists", "absent", "attr", "count", "text", "css", "cssAbsent"];
  const set = (i: number, r: HtmlRule) => onChange(rules.map((x, k) => (k === i ? r : x)));
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {rules.map((r, i) => {
        const kind = ruleKind(r);
        const res = results?.[i];
        return (
          <div key={i} className={cn("flex flex-wrap items-center gap-1.5 rounded-[10px] border p-1.5", res ? (res.ok ? "border-success/50" : "border-error/50") : "border-border")}>
            <select value={kind} onChange={(e) => set(i, makeRule(e.target.value as RuleKind, r))} className={cn(field, "pr-1")}>
              {kinds.map((k) => (
                <option key={k} value={k}>
                  {t(`bug.rule.${k}` as MessageKey)}
                </option>
              ))}
            </select>
            <input value={r.selector} onChange={(e) => set(i, { ...r, selector: e.target.value })} placeholder={t("bug.selector")} spellCheck={false} className={cn(field, "w-[140px] font-mono")} />
            {kind === "attr" && <input value={r.everyHasAttr ?? ""} onChange={(e) => set(i, { ...r, everyHasAttr: e.target.value })} placeholder="alt" className={cn(field, "w-[80px] font-mono")} />}
            {kind === "count" && <input type="number" min={1} value={r.minCount ?? 2} onChange={(e) => set(i, { ...r, minCount: Math.max(1, Number(e.target.value)) })} className={cn(field, "w-[64px]")} />}
            {kind === "text" && <input value={r.text ?? ""} onChange={(e) => set(i, { ...r, text: e.target.value })} placeholder="текст" className={cn(field, "w-[110px]")} />}
            {(kind === "css" || kind === "cssAbsent") && (
              <>
                <input value={r.css?.property ?? ""} onChange={(e) => set(i, { ...r, css: { ...r.css, property: e.target.value } })} placeholder="display" spellCheck={false} className={cn(field, "w-[110px] font-mono")} />
                <span className="text-muted">:</span>
                <input value={r.css?.value ?? ""} onChange={(e) => set(i, { ...r, css: { property: r.css?.property ?? "", value: e.target.value || undefined } })} placeholder="flex" spellCheck={false} className={cn(field, "w-[90px] font-mono")} />
              </>
            )}
            <input value={r.label} onChange={(e) => set(i, { ...r, label: e.target.value })} placeholder={t("bug.ruleLabel")} className={cn(field, "min-w-[140px] flex-1")} />
            {res && !res.ok && res.got && <span className="w-full px-1 text-[11px] text-error">{res.got}</span>}
            <button type="button" onClick={() => onChange(rules.filter((_, k) => k !== i))} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
              <X size={13} />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => onChange([...rules, css ? { selector: "", label: "", exists: true, css: { property: "", value: undefined } } : { selector: "", label: "", exists: true }])}
        className="inline-flex items-center gap-1.5 self-start rounded-[6px] px-1 py-1 text-[12px] text-muted hover:text-fg"
      >
        <Plus size={13} /> {t("bug.addRule")}
      </button>
    </div>
  );
}

function TestsEditor({ tests, onChange }: { tests: { call: string; expected: string }[]; onChange: (t: { call: string; expected: string }[]) => void }) {
  const t = useT();
  const list = tests.length ? tests : [{ call: "", expected: "" }];
  return (
    <div className="mt-1 flex flex-col gap-1.5">
      {list.map((x, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input value={x.call} onChange={(e) => onChange(list.map((y, k) => (k === i ? { ...y, call: e.target.value } : y)))} placeholder="solve(2)" spellCheck={false} className={cn(field, "min-w-0 flex-[3] font-mono")} />
          <span className="text-muted">→</span>
          <input value={x.expected} onChange={(e) => onChange(list.map((y, k) => (k === i ? { ...y, expected: e.target.value } : y)))} placeholder="4" spellCheck={false} className={cn(field, "min-w-0 flex-[2] font-mono")} />
          {list.length > 1 && (
            <button type="button" onClick={() => onChange(list.filter((_, k) => k !== i))} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
              <X size={13} />
            </button>
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...list, { call: "", expected: "" }])} className="inline-flex items-center gap-1.5 self-start rounded-[6px] px-1 py-1 text-[12px] text-muted hover:text-fg">
        <Plus size={13} /> {t("cw.addTest")}
      </button>
    </div>
  );
}
