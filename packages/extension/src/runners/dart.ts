/**
 * Dart: `dart файл.dart` у ученика (Dart SDK или Flutter SDK). Код ученика и тесты
 * собираются в один файл: сначала код ученика (его main переименовывается),
 * потом обвязка, которая вызывает каждый тест и печатает JSON с меткой.
 * Первый запуск Dart компилирует файл — поэтому тайм-аут больше, чем у Python.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CodeTest, TestResult } from "@codearena/shared";
import type { RunOutcome, Runner } from "./types.ts";

const MARK = "@@CODEARENA@@";
export const DART_TIMEOUT_MS = 20_000;

/** Строковый литерал Dart: JSON-строка + экранированный $ (иначе это интерполяция). */
const dartStr = (s: string) => JSON.stringify(s).replace(/\$/g, "\\$");

/** main ученика мешает main обвязки — переименовываем объявление верхнего уровня. */
export function renameMain(code: string): string {
  return code.replace(/^(\s*(?:void\s+|Future<void>\s+|dynamic\s+)?)main(\s*\()/m, "$1__studentMain$2");
}

export function dartProgram(code: string, tests: CodeTest[]): string {
  const calls = tests
    .map((t) => `  __caTest(${dartStr(t.call)}, ${dartStr(t.expected)}, () => (${t.call}), () => (${t.expected}));`)
    .join("\n");
  return `${renameMain(code)}

// ---- CodeArena ----
bool __caEq(Object? a, Object? b) {
  if (a is List && b is List) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!__caEq(a[i], b[i])) return false;
    }
    return true;
  }
  if (a is Map && b is Map) {
    if (a.length != b.length) return false;
    for (final k in a.keys) {
      if (!b.containsKey(k) || !__caEq(a[k], b[k])) return false;
    }
    return true;
  }
  if (a is Set && b is Set) return a.length == b.length && a.every((x) => b.any((y) => __caEq(x, y)));
  return a == b;
}

String __caShow(Object? v) {
  if (v is String) return "'" + v.replaceAll("'", "\\\\'") + "'";
  if (v is List) return '[' + v.map(__caShow).join(', ') + ']';
  if (v is Set) return '{' + v.map(__caShow).join(', ') + '}';
  if (v is Map) return '{' + v.entries.map((e) => __caShow(e.key) + ': ' + __caShow(e.value)).join(', ') + '}';
  return '$v';
}

String __caJson(String s) {
  final b = StringBuffer('"');
  for (final c in s.runes) {
    if (c == 0x22) b.write('\\\\"');
    else if (c == 0x5c) b.write('\\\\\\\\');
    else if (c < 0x20) b.write('\\\\u' + c.toRadixString(16).padLeft(4, '0'));
    else b.writeCharCode(c);
  }
  b.write('"');
  return b.toString();
}

final __caOut = <String>[];
void __caTest(String call, String expected, Object? Function() got, Object? Function() exp) {
  var ok = false;
  String shown;
  try {
    final g = got();
    shown = __caShow(g);
    ok = __caEq(g, exp());
  } catch (e) {
    shown = '$e';
  }
  if (shown.length > 300) shown = shown.substring(0, 300);
  __caOut.add('{"call":' + __caJson(call) + ',"expected":' + __caJson(expected) + ',"got":' + __caJson(shown) + ',"ok":' + (ok ? 'true' : 'false') + '}');
}

void main() {
${calls}
  print('${MARK}{"results":[' + __caOut.join(',') + ']}');
}
`;
}

let dartCmd: string[] | null = null;

async function findDart(): Promise<string[] | null> {
  if (dartCmd) return dartCmd;
  const candidates = process.platform === "win32" ? [["dart.exe"], ["dart.bat"]] : [["dart"]];
  for (const c of candidates) {
    const ok = await new Promise<boolean>((resolve) => {
      const p = spawn(c[0]!, ["--version"], { stdio: "ignore", shell: c[0]!.endsWith(".bat") });
      p.on("error", () => resolve(false));
      p.on("exit", (code) => resolve(code === 0));
    });
    if (ok) return (dartCmd = c);
  }
  return null;
}

/** Ошибку компилятора — коротко: путь к временному файлу убираем. */
function compileMessage(err: string): string {
  const lines = err
    .split("\n")
    .map((l) => l.replace(/^.*?solution\.dart:/, "line "))
    .filter((l) => l.trim() && !/^\s*\^+\s*$/.test(l));
  return lines.slice(0, 4).join("\n") || "Dart exited";
}

async function runDart(code: string, tests: CodeTest[]): Promise<RunOutcome> {
  const dart = await findDart();
  if (!dart) return { results: [], error: "no_dart" };
  const dir = await mkdtemp(join(tmpdir(), "codearena-"));
  try {
    const file = join(dir, "solution.dart");
    await writeFile(file, dartProgram(code, tests), "utf8");
    return await new Promise<RunOutcome>((resolve) => {
      const isBat = dart[0]!.endsWith(".bat");
      const p = spawn(dart[0]!, ["--disable-dart-dev", isBat ? `"${file}"` : file], {
        cwd: dir,
        stdio: ["ignore", "pipe", "pipe"],
        shell: isBat,
        env: { ...process.env, DART_SUPPRESS_ANALYTICS: "true" },
      });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        p.kill("SIGKILL");
        resolve({ results: [], error: "timeout" });
      }, DART_TIMEOUT_MS);
      p.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")).length > 2_000_000 && p.kill("SIGKILL"));
      p.stderr.on("data", (d: Buffer) => (err += d.toString("utf8")));
      p.on("error", () => {
        clearTimeout(timer);
        resolve({ results: [], error: "no_dart" });
      });
      p.on("exit", () => {
        clearTimeout(timer);
        const line = out.split("\n").reverse().find((l) => l.startsWith(MARK));
        if (!line) return resolve({ results: [], error: "compile", message: compileMessage(err || out) });
        const data = JSON.parse(line.slice(MARK.length)) as { results: TestResult[] };
        resolve({ results: data.results, error: null });
      });
    });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export const dartRunner: Runner = {
  languages: ["dart"],
  run: (code, checks) => runDart(code, checks.tests),
};
