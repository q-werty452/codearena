/** JavaScript: отдельный worker_thread с vm-песочницей (без require/process), тайм-аут 5 с. */
import { Worker } from "node:worker_threads";
import type { CodeTest, TestResult } from "@codearena/shared";
import { RUN_TIMEOUT_MS, type RunOutcome, type Runner } from "./types.ts";

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

export const javascriptRunner: Runner = {
  languages: ["javascript"],
  run: (code, checks) => runJavaScript(code, checks.tests),
};
