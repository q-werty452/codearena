import { describe, expect, it } from "vitest";
import { runTests, toReport } from "./runner.ts";

const evensTests = [
  { call: "evens([1, 2, 3, 4])", expected: "[2, 4]" },
  { call: "evens([])", expected: "[]" },
];

describe("Python", () => {
  it("правильное решение проходит все тесты", async () => {
    const r = await runTests("python", "def evens(nums):\n    return [n for n in nums if n % 2 == 0]", evensTests);
    expect(r.error).toBeNull();
    expect(r.results.map((x) => x.ok)).toEqual([true, true]);
    expect(toReport(r, evensTests)).toEqual({ passed: 2, total: 2, failures: [] });
  });

  it("неправильное: видно, какой тест упал и что вернулось", async () => {
    const r = await runTests("python", "def evens(nums):\n    print('debug')\n    return nums", evensTests);
    expect(r.results[0]).toMatchObject({ ok: false, got: "[1, 2, 3, 4]" });
    expect(r.results[1]!.ok).toBe(true);
    expect(toReport(r, evensTests).failures[0]).toMatchObject({ name: "evens([1, 2, 3, 4])", expected: "[2, 4]" });
  });

  it("ошибка синтаксиса и исключение в тесте", async () => {
    expect((await runTests("python", "def evens(nums)\n  return 1", evensTests)).error).toBe("compile");
    const r = await runTests("python", "def evens(nums):\n    return 1 / 0", evensTests);
    expect(r.results[0]!.got).toMatch(/ZeroDivisionError/);
  });

  it("бесконечный цикл обрывается по тайм-ауту", async () => {
    const t0 = Date.now();
    const r = await runTests("python", "def evens(nums):\n    while True: pass", evensTests);
    expect(r.error).toBe("timeout");
    expect(Date.now() - t0).toBeLessThan(7000);
  }, 10_000);
});

describe("JavaScript", () => {
  it("правильное решение и сравнение массивов", async () => {
    const r = await runTests("javascript", "const evens = (n) => n.filter((x) => x % 2 === 0);", evensTests);
    expect(r.error).toBeNull();
    expect(r.results.every((x) => x.ok)).toBe(true);
  });

  it("function-объявление, строки и неверный тип", async () => {
    const tests = [
      { call: "rev('abc')", expected: "'cba'" },
      { call: "rev('')", expected: "''" },
      { call: "num()", expected: "5" },
    ];
    const r = await runTests("javascript", "function rev(s) { return s.split('').reverse().join(''); }\nfunction num() { return '5'; }", tests);
    expect(r.results.map((x) => x.ok)).toEqual([true, true, false]); // '5' !== 5
  });

  it("нет доступа к require/process, бесконечный цикл обрывается", async () => {
    const r = await runTests("javascript", "function f() { return typeof require + typeof process; }", [{ call: "f()", expected: "'undefinedundefined'" }]);
    expect(r.results[0]!.ok).toBe(true);
    const loop = await runTests("javascript", "function f() { while (true) {} }", [{ call: "f()", expected: "1" }]);
    expect(loop.error).toBe("timeout");
  }, 10_000);

  it("синтаксическая ошибка", async () => {
    expect((await runTests("javascript", "function f( {", [{ call: "f()", expected: "1" }])).error).toBe("compile");
  });
});
