import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { runTests } from "./index.ts";
import { renameMain } from "./dart.ts";

const hasDart = (() => {
  try {
    execSync("dart --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("Dart runner", () => {
  it("переименовывает main ученика", () => {
    expect(renameMain("void main() {\n  print(1);\n}")).toContain("void __studentMain()");
    expect(renameMain("main() {}")).toContain("__studentMain()");
    expect(renameMain("int mainValue() => 1;")).toBe("int mainValue() => 1;");
  });

  it.runIf(hasDart)("тесты: списки, Map, строки с $, print ученика не мешает", async () => {
    const code = `import 'dart:math';
int sum(int a, int b) => a + b;
List<int> evens(List<int> xs) => xs.where((x) => x.isEven).toList();
Map<String, int> count(String s) {
  final m = <String, int>{};
  for (final c in s.split('')) m[c] = (m[c] ?? 0) + 1;
  return m;
}
String price(int n) { print('debug'); return '\\$$n'; }
void main() { print('ученик'); }`;
    const r = await runTests("dart", code, [
      { call: "sum(2, 3)", expected: "5" },
      { call: "evens([1, 2, 3, 4])", expected: "[2, 4]" },
      { call: "count('aab')", expected: "{'a': 2, 'b': 1}" },
      { call: "price(5)", expected: "'\\$5'" },
      { call: "sum(1, 1)", expected: "3" },
    ]);
    expect(r.error, r.message).toBeNull();
    expect(r.results.map((x) => x.ok)).toEqual([true, true, true, true, false]);
    expect(r.results[4]!.got).toBe("2");
  }, 60_000);

  it.runIf(hasDart)("ошибка компиляции и исключение в тесте", async () => {
    const bad = await runTests("dart", "int f() { return 'x'; }", [{ call: "f()", expected: "1" }]);
    expect(bad.error).toBe("compile");
    expect(bad.message).toMatch(/line \d+/);
    const thrown = await runTests("dart", "int f(List<int> a) => a[5];", [{ call: "f([1])", expected: "1" }]);
    expect(thrown.error).toBeNull();
    expect(thrown.results[0]!.ok).toBe(false);
    expect(thrown.results[0]!.got).toMatch(/RangeError/);
  }, 60_000);
});
