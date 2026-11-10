/** Python: дочерний процесс python3 ученика (режим -I), тайм-аут 5 с. */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeTest, TestResult } from "@codearena/shared";
import { RUN_TIMEOUT_MS, type RunOutcome, type Runner } from "./types.ts";

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


export const pythonRunner: Runner = {
  languages: ["python"],
  run: (code, checks) => runPython(code, checks.tests),
};
