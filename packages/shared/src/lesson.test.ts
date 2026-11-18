import { describe, expect, it } from "vitest";
import { lessonProgress } from "./lesson.ts";

const ref = `<ul class="menu">
  <li>Главная</li>
  <li>Каталог</li>
  <li>Контакты</li>
</ul>`;

describe("прогресс по чекпоинту", () => {
  it("копия эталона — 100%, пусто — 0%", () => {
    expect(lessonProgress(ref, ref)).toBe(100);
    expect(lessonProgress(ref, "")).toBe(0);
  });
  it("пробелы, отступы и пустые строки не важны", () => {
    const mine = `<ul class="menu">\n\n<li>Главная</li>\n      <li>Каталог</li>\n\n<li> Контакты </li>\n</ul>\n`;
    expect(lessonProgress(ref, mine)).toBe(100);
  });
  it("часть кода — частичный процент", () => {
    const p = lessonProgress(ref, `<ul class="menu">\n  <li>Главная</li>`);
    expect(p).toBeGreaterThan(30);
    expect(p).toBeLessThan(60);
  });
  it("одна опечатка стоит слова, а не всей строки", () => {
    // Раньше строка с опечаткой не засчитывалась целиком.
    const typo = ref.replace("Каталог", "Католог");
    expect(lessonProgress(ref, typo)).toBeGreaterThanOrEqual(90);
    expect(lessonProgress(ref, typo)).toBeLessThan(100);
  });
  it("недописанная строка даёт часть процента", () => {
    const half = `<ul class="menu">\n  <li>Главная</li>\n  <li>Кат`;
    expect(lessonProgress(ref, half)).toBeGreaterThan(lessonProgress(ref, `<ul class="menu">\n  <li>Главная</li>`));
  });
  it("100% — только когда весь эталон на месте", () => {
    expect(lessonProgress(ref, ref.replace("</ul>", "</ul"))).toBeLessThan(100);
  });
  it("лишнее у ученика не штрафуется, порядок важен", () => {
    const extra = `<!-- мой комментарий -->\n${ref}\n<p>своё</p>`;
    expect(lessonProgress(ref, extra)).toBe(100);
    const shuffled = `</ul>\n<li>Контакты</li>\n<li>Каталог</li>\n<li>Главная</li>\n<ul class="menu">`;
    // Порядок учитывается: перемешанный код не «готов», хотя теги совпадают.
    expect(lessonProgress(ref, shuffled)).toBeLessThan(90);
  });
  it("пустой эталон — 0%: «готово» никому не ставим", () => expect(lessonProgress("\n  \n", "что угодно")).toBe(0));
});
