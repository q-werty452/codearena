import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, Copy, FlaskConical, FolderOpen, Play, Plus, Save, Sparkles, Trash2, X, Library, Wand2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { HostToUi, Language, Task, TaskSet, TestResult } from "@codearena/shared";
import { RulesEditor } from "./BugEditor.tsx";
import { Button } from "../../ui/Button.tsx";
import { Card } from "../../ui/Card.tsx";
import { Segmented } from "../../ui/Controls.tsx";
import { cn } from "../../lib/cn.ts";
import { useT } from "../../lib/i18n.ts";
import { host } from "../../lib/session.ts";
import { onHostMessage } from "../../lib/vscode.ts";

export type CodeTaskDraft = Extract<Task, { type: "code" }>;
/** Языки Codewars: фронтенд первым (HTML/CSS проверяются правилами), потом JS и Python. */
type Lang = Extract<Language, "html" | "css" | "javascript" | "python" | "dart">;
const isRules = (l: Language) => l === "html" || l === "css";
const STARTERS: Record<Lang, string> = {
  html: "<!-- твоя разметка -->",
  css: ".selector {\n  \n}",
  javascript: "function solve(x) {\n  \n}",
  python: "def solve(x):\n    pass",
  dart: "int solve(int x) {\n  return 0;\n}",
};

export function blankCode(language: Lang = "html"): CodeTaskDraft {
  return {
    type: "code",
    topic: "",
    difficulty: "easy",
    timeLimitSec: 300,
    language,
    prompt: "",
    starter: STARTERS[language],
    tests: isRules(language) ? [] : [{ call: "", expected: "" }],
    rules: [],
  };
}

export function codeError(q: CodeTaskDraft): "edit.errPrompt" | "cw.errStarter" | "cw.errTests" | null {
  if (!q.prompt.trim()) return "edit.errPrompt";
  if (!q.starter.trim()) return "cw.errStarter";
  const has = isRules(q.language) ? q.rules.some((r) => r.selector.trim() && r.label.trim()) : q.tests.some((x) => x.call.trim() && x.expected.trim());
  if (!has) return "cw.errTests";
  return null;
}

export function cleanCode(q: CodeTaskDraft, topic: string): CodeTaskDraft {
  return {
    ...q,
    topic: q.topic || topic || "Codewars",
    prompt: q.prompt.trim(),
    tests: q.tests.map((x) => ({ call: x.call.trim(), expected: x.expected.trim() })).filter((x) => x.call && x.expected),
    solution: q.solution?.trim() || undefined,
  };
}

const TIMES = [180, 300, 600, 900] as const;

export function CodeEditor({
  set,
  onChange,
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
  onBack: () => void;
  onStart: (tasks: Task[]) => void;
  onSample: () => void;
  onBank?: () => void;
  onAi?: () => void;
  onLoad: () => void;
  onSave: () => void;
}) {
  const t = useT();
  const tasks = set.tasks.filter((x): x is CodeTaskDraft => x.type === "code");
  const errors = tasks.map(codeError);
  const bad = errors.filter(Boolean).length;
  const update = (next: CodeTaskDraft[]) => onChange({ ...set, tasks: next });
  const patch = (i: number, p: Partial<CodeTaskDraft>) => update(tasks.map((q, k) => (k === i ? { ...q, ...p } : q)));

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto flex w-full max-w-[900px] flex-1 flex-col gap-5 px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" size="sm" icon={<ArrowLeft size={14} />} onClick={onBack}>
            {t("pick.title")}
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            {onBank && (
              <Button size="sm" icon={<Library size={14} />} onClick={onBank}>
                {t("bank.open")}
              </Button>
            )}
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
          <h1 className="text-title font-semibold">{t("cw.editTitle")}</h1>
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
            <div className="flex gap-2">
              <Button variant="primary" icon={<Plus size={14} />} onClick={() => update([blankCode()])}>
                {t("cw.add")}
              </Button>
              {onAi && (
                <Button icon={<Wand2 size={14} />} onClick={onAi}>
                  {t("my.ai")}
                </Button>
              )}
              <Button icon={<Sparkles size={14} />} onClick={onSample}>
                {t("edit.sample")}
              </Button>
            </div>
          </Card>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {tasks.map((q, i) => (
                <CodeCard
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
            <Button icon={<Plus size={14} />} onClick={() => update([...tasks, blankCode((tasks[tasks.length - 1]?.language as Lang | undefined) ?? "html")])} className="self-start">
              {t("cw.add")}
            </Button>
          </div>
        )}
      </div>

      <footer className="sticky bottom-0 z-20 mt-auto border-t border-border bg-[color-mix(in_srgb,var(--vscode-editor-background,var(--ca-bg))_88%,transparent)] backdrop-blur">
        <div className="mx-auto flex max-w-[900px] items-center justify-end gap-3 px-6 py-3">
          {tasks.length > 0 && (
            <span className={cn("text-[12px]", bad ? "text-warning" : "text-muted")}>
              {bad ? t("tug.notReady", { n: bad }) : t("cw.ready", { n: tasks.length })}
            </span>
          )}
          <Button variant="primary" size="lg" icon={<Play size={18} />} disabled={tasks.length === 0 || bad > 0} onClick={() => onStart(tasks.map((q) => cleanCode(q, set.title)))}>
            {t("common.start")}
          </Button>
        </div>
      </footer>
    </div>
  );
}

const textarea =
  "w-full resize-y rounded-btn border border-border bg-input px-3 py-2 font-mono text-[13px] leading-[1.5] outline-none focus:border-[var(--ca-focus)]";

export function CodeCard({
  n,
  q,
  error,
  onChange,
  onDuplicate,
  onDelete,
}: {
  n: number;
  q: CodeTaskDraft;
  error: string | null;
  onChange: (p: Partial<CodeTaskDraft>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [check, setCheck] = useState<{ running: boolean; results: TestResult[]; error: string | null; message?: string } | null>(null);
  const reqId = useRef("");

  useEffect(
    () =>
      onHostMessage<HostToUi>((m) => {
        if (m.type === "check_result" && m.requestId === reqId.current) setCheck({ running: false, results: m.results, error: m.error, message: m.message });
      }),
    [],
  );

  const runCheck = () => {
    reqId.current = Math.random().toString(36).slice(2);
    setCheck({ running: true, results: [], error: null });
    const tests = q.tests.filter((x) => x.call.trim() && x.expected.trim());
    host.post({ type: "check_code", requestId: reqId.current, language: q.language, code: q.solution ?? "", tests: isRules(q.language) ? [] : tests, rules: isRules(q.language) ? q.rules : [] });
  };
  const failed = check?.results.filter((r) => !r.ok).length ?? 0;

  return (
    <motion.div layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.18 }} className="rounded-card border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="rounded-[6px] bg-surface-2 px-2 py-0.5 text-[12px] font-semibold tabular text-muted">{t("tug.task", { n })}</span>
        <Segmented<Lang>
          value={q.language as Lang}
          onChange={(language) => onChange({ language, starter: q.starter.trim() && q.starter !== STARTERS[q.language as Lang] ? q.starter : STARTERS[language] })}
          options={[
            { value: "html", label: "HTML" },
            { value: "css", label: "CSS" },
            { value: "javascript", label: "JS" },
            { value: "python", label: "Python" },
            { value: "dart", label: "Dart" },
          ]}
        />
        <Segmented<string>
          value={String(q.timeLimitSec)}
          onChange={(v) => onChange({ timeLimitSec: Number(v) })}
          options={TIMES.map((s) => ({ value: String(s), label: t("tug.min", { n: s / 60 }) }))}
        />
        {error && <span className="text-[12px] text-warning">{t(error as "edit.errPrompt")}</span>}
        <div className="ml-auto flex">
          <button type="button" title={t("edit.duplicate")} onClick={onDuplicate} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
            <Copy size={14} />
          </button>
          <button type="button" title={t("edit.delete")} onClick={onDelete} className="flex size-7 items-center justify-center rounded-[7px] text-muted hover:bg-error/10 hover:text-error">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <label className="text-[12px] font-medium text-muted">{t("cw.prompt")}</label>
      <textarea
        rows={2}
        value={q.prompt}
        onChange={(e) => onChange({ prompt: e.target.value })}
        placeholder={t("cw.promptPlaceholder")}
        maxLength={1000}
        className="mt-1 w-full resize-y rounded-btn border border-border bg-input px-3 py-2 text-[14px] font-semibold outline-none focus:border-[var(--ca-focus)]"
      />

      <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
        <div>
          <label className="text-[12px] font-medium text-muted">{t("cw.starter")}</label>
          <textarea rows={4} value={q.starter} onChange={(e) => onChange({ starter: e.target.value })} spellCheck={false} className={cn(textarea, "mt-1")} />
        </div>
        <div>
          <label className="text-[12px] font-medium text-muted">{isRules(q.language) ? t("bug.rules") : t("cw.tests")}</label>
          {isRules(q.language) ? (
            <RulesEditor rules={q.rules} css={q.language === "css"} onChange={(rules) => onChange({ rules })} results={check && !check.running ? check.results : undefined} />
          ) : (
          <div className="mt-1 flex flex-col gap-1.5">
            {q.tests.map((test, i) => {
              const r = check && !check.running ? check.results[i] : undefined;
              return (
                <div key={i} className="flex items-center gap-1.5">
                  <input
                    value={test.call}
                    onChange={(e) => onChange({ tests: q.tests.map((x, k) => (k === i ? { ...x, call: e.target.value } : x)) })}
                    placeholder="solve(2)"
                    aria-label={t("cw.call")}
                    spellCheck={false}
                    className="h-8 min-w-0 flex-[3] rounded-[8px] border border-border bg-input px-2 font-mono text-[12.5px] outline-none focus:border-[var(--ca-focus)]"
                  />
                  <span className="text-muted">→</span>
                  <input
                    value={test.expected}
                    onChange={(e) => onChange({ tests: q.tests.map((x, k) => (k === i ? { ...x, expected: e.target.value } : x)) })}
                    placeholder="4"
                    aria-label={t("cw.expected")}
                    spellCheck={false}
                    className={cn(
                      "h-8 min-w-0 flex-[2] rounded-[8px] border bg-input px-2 font-mono text-[12.5px] outline-none focus:border-[var(--ca-focus)]",
                      r ? (r.ok ? "border-success/60" : "border-error/60") : "border-border",
                    )}
                    title={r && !r.ok ? `${t("cw.got")}: ${r.got}` : undefined}
                  />
                  {q.tests.length > 1 && (
                    <button type="button" onClick={() => onChange({ tests: q.tests.filter((_, k) => k !== i) })} className="flex size-7 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-hover hover:text-fg">
                      <X size={13} />
                    </button>
                  )}
                </div>
              );
            })}
            <button type="button" onClick={() => onChange({ tests: [...q.tests, { call: "", expected: "" }] })} className="inline-flex items-center gap-1.5 self-start rounded-[6px] px-1 py-1 text-[12px] text-muted hover:text-fg">
              <Plus size={13} /> {t("cw.addTest")}
            </button>
          </div>
          )}
        </div>
      </div>

      <details className="mt-3 group" open={!!q.solution}>
        <summary className="cursor-pointer select-none text-[12px] font-medium text-muted hover:text-fg">{t("cw.solution")}</summary>
        <textarea rows={4} value={q.solution ?? ""} onChange={(e) => onChange({ solution: e.target.value })} spellCheck={false} className={cn(textarea, "mt-2")} />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <Button size="sm" icon={<FlaskConical size={14} />} loading={check?.running} disabled={!q.solution?.trim()} onClick={runCheck}>
            {t("cw.check")}
          </Button>
          {check && !check.running && (
            <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-semibold", check.error || failed ? "text-error" : "text-success")}>
              {check.error || failed ? <X size={13} /> : <Check size={13} />}
              {check.error === "no_python" || check.error === "no_dart"
                ? t(check.error === "no_dart" ? "cw.noDart" : "cw.noPython")
                : check.error === "timeout"
                  ? t("cw.timeout")
                  : check.error
                    ? `${t("cw.compile")}: ${check.message ?? ""}`
                    : failed
                      ? t("cw.checkFail", { n: failed })
                      : t("cw.checkOk", { n: check.results.length })}
            </span>
          )}
        </div>
      </details>
    </motion.div>
  );
}
