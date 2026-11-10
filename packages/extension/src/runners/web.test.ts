import { describe, expect, it } from "vitest";
import { HtmlRule } from "@codearena/shared";
import { runChecks } from "./index.ts";
import { normSelector, normValue, parseCss } from "./web.ts";

const rule = (r: Record<string, unknown>) => HtmlRule.parse(r);
const html = (code: string, rules: Record<string, unknown>[]) => runChecks("html", code, { tests: [], rules: rules.map(rule) });
const css = (code: string, rules: Record<string, unknown>[]) => runChecks("css", code, { tests: [], rules: rules.map(rule) });
const oks = async (p: ReturnType<typeof html>) => (await p).results.map((r) => r.ok);

describe("HTML: правила по селекторам", () => {
  const page = `<!doctype html><html><body>
    <header><nav><ul><li>Главная</li><li>О нас</li><li>Контакты</li></ul></nav></header>
    <main><img src="a.png" alt="Кот"><img src="b.png"></main>
    <div class="footer">© 2026</div>
  </body></html>`;

  it("есть / нет элемента", async () => {
    expect(await oks(html(page, [
      { selector: "header nav", label: "есть nav в header" },
      { selector: "footer", label: "есть footer" },
      { selector: "div.footer", exists: false, label: "нет div.footer" },
    ]))).toEqual([true, false, false]);
  });

  it("у каждого img есть alt, минимум 3 пункта меню, текст", async () => {
    const r = await html(page, [
      { selector: "img", everyHasAttr: "alt", label: "у каждого img есть alt" },
      { selector: "nav li", minCount: 3, label: "в меню 3 пункта" },
      { selector: "nav li", minCount: 4, label: "в меню 4 пункта" },
      { selector: "li", text: "контакты", label: "есть пункт «Контакты»" },
    ]);
    expect(r.results.map((x) => x.ok)).toEqual([false, true, false, true]);
    expect(r.results[0]!.got).toBe("без alt: 1");
    expect(r.results[2]!.got).toBe("найдено 3 из 4");
  });

  it("исправленная разметка проходит", async () => {
    const fixed = page.replace('<div class="footer">© 2026</div>', "<footer>© 2026</footer>").replace('src="b.png"', 'src="b.png" alt=""');
    expect(await oks(html(fixed, [
      { selector: "footer", label: "есть footer" },
      { selector: "div.footer", exists: false, label: "нет div.footer" },
      { selector: "img", everyHasAttr: "alt", label: "alt" },
    ]))).toEqual([true, true, true]);
  });

  it("стили внутри <style> проверяются CSS-правилами", async () => {
    const withStyle = `<style>.card { display: flex; gap: 8px }</style><div class="card"></div>`;
    expect(await oks(html(withStyle, [
      { selector: ".card", css: { property: "display", value: "flex" }, label: ".card — flex" },
      { selector: ".card", css: { property: "float" }, exists: false, label: "без float" },
    ]))).toEqual([true, true]);
  });

  it("неверный селектор — понятная ошибка, а не падение", async () => {
    const r = await html("<p>x</p>", [{ selector: "p[[", label: "плохой селектор" }]);
    expect(r.results[0]).toMatchObject({ ok: false });
  });
});

describe("CSS: правила таблицы стилей", () => {
  const sheet = `
    /* шапка */
    .header > .logo { color: #FFF; }
    .card,
    .tile { display: Flex !important; margin: 0px; }
    @media (max-width: 600px) { .card { flex-direction: column } }
    .btn { font-family: "Inter", sans-serif }
  `;

  it("свойство и значение с нормализацией (регистр, !important, 0px, кавычки)", async () => {
    expect(await oks(css(sheet, [
      { selector: ".card", css: { property: "display", value: "flex" }, label: "card flex" },
      { selector: ".tile", css: { property: "margin", value: "0" }, label: "tile margin 0" },
      { selector: ".header>.logo", css: { property: "color", value: "#fff" }, label: "logo белый" },
      { selector: ".btn", css: { property: "font-family", value: "Inter, sans-serif" }, label: "шрифт" },
      { selector: ".card", css: { property: "flex-direction", value: "column" }, label: "из @media" },
    ]))).toEqual([true, true, true, true, true]);
  });

  it("нет правила / нет свойства / запрещённое свойство", async () => {
    const r = await css(sheet, [
      { selector: ".footer", css: { property: "display" }, label: "есть .footer" },
      { selector: ".card", css: { property: "gap" }, label: "у card есть gap" },
      { selector: ".card", css: { property: "display" }, exists: false, label: "card без display" },
    ]);
    expect(r.results.map((x) => x.ok)).toEqual([false, false, false]);
    expect(r.results[0]!.got).toBe("нет правила .footer");
    expect(r.results[1]!.got).toBe("нет gap");
  });

  it("разборщик и нормализация", () => {
    expect(normSelector("  ul   >  li  +  li ")).toBe("ul>li+li");
    expect(normValue(" 0PX  !important")).toBe("0");
    expect(parseCss("@font-face { font-family: X } a { color: red }").map((r) => r.selectors)).toEqual([["a"]]);
  });
});
