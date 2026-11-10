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
  it("часть строк — частичный процент", () => {
    expect(lessonProgress(ref, `<ul class="menu">\n  <li>Главная</li>`)).toBe(40);
  });
  it("лишние строки ученика не штрафуются, порядок важен", () => {
    const extra = `<!-- мой комментарий -->\n${ref}\n<p>своё</p>`;
    expect(lessonProgress(ref, extra)).toBe(100);
    const shuffled = `</ul>\n<li>Контакты</li>\n<li>Каталог</li>\n<li>Главная</li>\n<ul class="menu">`;
    expect(lessonProgress(ref, shuffled)).toBe(20);
  });
  it("пустой эталон — 100%", () => expect(lessonProgress("\n  \n", "что угодно")).toBe(100));
});
