/**
 * Запуск тестов на компьютере ученика. Сервер код не выполняет — поэтому
 * он бесплатный. Python — дочерний процесс python3, JavaScript — отдельный
 * worker_thread с изолированным контекстом. Оба с тайм-аутом 5 секунд.
 *
 * Модуль не зависит от vscode и покрыт тестами.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import type { CodeTest, TestReport, TestResult } from "@codearena/shared";

export const RUN_TIMEOUT_MS = 5000;

export interface RunOutcome {
  results: TestResult[];
  error: null | "no_python" | "timeout" | "compile";
  message?: string;
}

export function toReport(o: RunOutcome, tests: CodeTest[]): TestReport {
  const passed = o.error ? 0 : o.results.filter((r) => r.ok).length;
  return {
    passed,
    total: tests.length,
    failures: (o.error ? tests.map((t) => ({ name: t.call, expected: t.expected, got: o.error ?? undefined })) : o.results.filter((r) => !r.ok).map((r) => ({ name: r.call, expected: r.expected, got: r.got })))
      .slice(0, 50)
      .map((f) => ({ name: f.name.slice(0, 200), expected: f.expected?.slice(0, 200), got: f.got?.slice(0, 200) })),
  };
}

export function runTests(language: "python" | "javascript", code: string, tests: CodeTest[]): Promise<RunOutcome> {
  return language === "python" ? runPython(code, tests) : runJavaScript(code, tests);
}

/* ───────────────────────── Python ───────────────────────── */

const MARK = "@@CODEARENA@@";

/** Обвязка: выполняет код ученика, потом каждый тест; печать ученика не мешает. */
const PY_HARNESS = `
import contextlib, io, json, sys
src = open(sys.argv[1], encoding="utf-8").read()
tests = json.load(open(sys.argv[2], encoding="utf-8"))
ns = {"__name__": "__codearena__"}
sink = io.StringIO()
def short(e):
    return f"{type(e).__name__}: {e}"[:300]
try:
    with contextlib.redirect_stdout(sink):
        exec(compile(src, "solution.py", "exec"), ns)
except BaseException as e:
    print("${MARK}" + json.dumps({"error": "compile", "message": short(e)}))
    sys.exit(0)
out = []
for t in tests:
    r = {"call": t["call"], "expected": t["expected"], "ok": False}
    try:
        with contextlib.redirect_stdout(sink):
            got = eval(t["call"], ns)
        exp = eval(t["expected"], ns)
        r["got"] = repr(got)[:300]
        r["ok"] = bool(got == exp)
    except BaseException as e:
        r["got"] = short(e)
    out.append(r)
print("${MARK}" + json.dumps({"results": out}))
`;

/** Какой командой запускать Python: python3, python или py -3 (Windows). */
let pythonCmd: string[] | null = null;

async function findPython(): Promise<string[] | null> {
  if (pythonCmd) return pythonCmd;
  const candidates = process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
  for (const c of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(c[0]!, [...c.slice(1), "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
    if (ok) return (pythonCmd = c);
  }
  return null;
}

async function runPython(code: string, tests: CodeTest[]): Promise<RunOutcome> {
  const py = await findPython();
  if (!py) return { results: [], error: "no_python" };
  const dir = await mkdtemp(join(tmpdir(), "codearena-"));
  try {
    const files = { harness: join(dir, "harness.py"), solution: join(dir, "solution.py"), tests: join(dir, "tests.json") };
    await Promise.all([
      writeFile(files.harness, PY_HARNESS, "utf8"),
      writeFile(files.solution, code, "utf8"),
      writeFile(files.tests, JSON.stringify(tests), "utf8"),
    ]);
    return await new Promise<RunOutcome>((resolve) => {
      // -I: без пользовательских site-packages и переменных окружения.
      const p = spawn(py[0]!, [...py.slice(1), "-I", files.harness, files.solution, files.tests], { cwd: dir, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        p.kill("SIGKILL");
        resolve({ results: [], error: "timeout" });
      }, RUN_TIMEOUT_MS);
      p.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")).length > 2_000_000 && p.kill("SIGKILL"));
      p.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
      p.on("exit", () => {
        clearTimeout(timer);
        const line = out.split("\n").reverse().find((l) => l.startsWith(MARK));
        if (!line) return resolve({ results: [], error: "compile", message: err.trim().split("\n").slice(-3).join("\n") || "Python exited" });
        const data = JSON.parse(line.slice(MARK.length)) as { results?: TestResult[]; error?: "compile"; message?: string };
        resolve(data.error ? { results: [], error: "compile", message: data.message } : { results: data.results ?? [], error: null });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/* ───────────────────────── JavaScript ───────────────────────── */

/** Код потока: изолированный vm-контекст, без require и process. */
const JS_WORKER = `(() => {
const { parentPort, workerData } = require("node:worker_threads");
const vm = require("node:vm");
const { code, tests, timeout } = workerData;
const noop = () => {};
const ctx = vm.createContext({ console: { log: noop, info: noop, warn: noop, error: noop } });
const short = (e) => String(e && e.name ? e.name + ": " + e.message : e).slice(0, 300);
const fmt = (v) => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); } };
try {
  new vm.Script(code, { filename: "solution.js" }).runInContext(ctx, { timeout });
} catch (e) {
  parentPort.postMessage({ error: String(e && e.message || e).includes("timed out") ? "timeout" : "compile", message: short(e) });
  return;
}
const results = tests.map((t) => {
  const r = { call: t.call, expected: t.expected, ok: false };
  try {
    ctx.__got = new vm.Script("(" + t.call + ")").runInContext(ctx, { timeout });
    ctx.__exp = new vm.Script("(" + t.expected + ")").runInContext(ctx, { timeout });
    r.got = fmt(ctx.__got).slice(0, 300);
    // Сравнение внутри контекста ученика: так массивы из «другого мира» сравниваются корректно.
    r.ok = vm.runInContext("typeof __got === typeof __exp && JSON.stringify(__got) === JSON.stringify(__exp)", ctx);
  } catch (e) {
    r.got = short(e);
    if (String(e && e.message).includes("timed out")) r.timeout = true;
  }
  return r;
});
parentPort.postMessage(results.some((r) => r.timeout) ? { error: "timeout" } : { results });
})();
`;

function runJavaScript(code: string, tests: CodeTest[]): Promise<RunOutcome> {
  return new Promise((resolve) => {
    const w = new Worker(JS_WORKER, {
      eval: true,
      workerData: { code, tests, timeout: RUN_TIMEOUT_MS },
      resourceLimits: { maxOldGenerationSizeMb: 128 },
      stdout: true,
      stderr: true,
    });
    let done = false;
    const finish = (o: RunOutcome) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void w.terminate();
      resolve(o);
    };
    // Подстраховка: vm.timeout не ловит асинхронные бесконечные циклы.
    const timer = setTimeout(() => finish({ results: [], error: "timeout" }), RUN_TIMEOUT_MS + 1000);
    w.on("message", (m: { results?: TestResult[]; error?: "compile" | "timeout"; message?: string }) =>
      finish(m.error ? { results: [], error: m.error, message: m.message } : { results: m.results ?? [], error: null }),
    );
    w.on("error", (e: Error) => finish({ results: [], error: "compile", message: String(e.message).slice(0, 300) }));
    w.on("exit", () => finish({ results: [], error: "compile", message: "Worker exited" }));
  });
}
