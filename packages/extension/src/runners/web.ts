/**
 * HTML/CSS: проверка правилами. Разметка — по CSS-селекторам (node-html-parser),
 * стили — по правилам таблицы стилей (свой небольшой разборщик CSS).
 * Ничего не выполняется, поэтому работает мгновенно и безопасно.
 */
import { parse, type HTMLElement } from "node-html-parser";
import type { HtmlRule, TestResult } from "@codearena/shared";
import type { RunOutcome, Runner } from "./types.ts";

/* ───────────────────────── Мини-разборщик CSS ───────────────────────── */

export interface CssRule {
  selectors: string[];
  decls: Map<string, string>;
}

/** Нормализация селектора: лишние пробелы и пробелы вокруг > + ~ , не важны. */
export function normSelector(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/\s*([>+~,])\s*/g, "$1");
}

/** Нормализация значения: регистр, пробелы, !important, «0px» → «0». */
export function normValue(v: string): string {
  return v
    .replace(/!important/i, "")
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .toLowerCase()
    .replace(/(^|\s)0(px|em|rem|%)(?=\s|$)/g, "$10")
    .replace(/(['"])(.*?)\1/g, "$2");
}

/** Разбирает CSS в плоский список правил; содержимое @media и т.п. тоже попадает в список. */
export function parseCss(css: string): CssRule[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: CssRule[] = [];
  let i = 0;
  const parseBlock = (end: number) => {
    while (i < end) {
      const open = text.indexOf("{", i);
      if (open < 0 || open >= end) break;
      const prelude = text.slice(i, open).trim();
      // Найти парную закрывающую скобку.
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const close = j - 1;
      if (prelude.startsWith("@")) {
        // @media / @supports — заходим внутрь; @font-face, @keyframes — пропускаем.
        if (/^@(media|supports|layer|container)\b/i.test(prelude)) {
          i = open + 1;
          parseBlock(close);
        }
      } else if (prelude) {
        const decls = new Map<string, string>();
        for (const d of text.slice(open + 1, close).split(";")) {
          const k = d.indexOf(":");
          if (k > 0) decls.set(d.slice(0, k).trim().toLowerCase(), d.slice(k + 1).trim());
        }
        out.push({ selectors: prelude.split(",").map(normSelector), decls });
      }
      i = close + 1;
    }
  };
  parseBlock(text.length);
  return out;
}

/* ───────────────────────── Проверка правил ───────────────────────── */

function checkCss(rule: HtmlRule, sheet: CssRule[]): TestResult {
  const sel = normSelector(rule.selector);
  const prop = rule.css!.property.trim().toLowerCase();
  const matching = sheet.filter((r) => r.selectors.includes(sel));
  // Последнее объявление побеждает (как в каскаде для одного селектора).
  let value: string | undefined;
  for (const r of matching) if (r.decls.has(prop)) value = r.decls.get(prop);
  const want = rule.css!.value;
  const hit = value !== undefined && (want === undefined || normValue(value) === normValue(want));
  const ok = rule.exists ? hit : !hit;
  const got = matching.length === 0 ? `нет правила ${rule.selector}` : value === undefined ? `нет ${prop}` : `${prop}: ${value}`;
  return { call: rule.label, expected: "", ok, got: ok ? undefined : got };
}

function checkDom(rule: HtmlRule, root: HTMLElement): TestResult {
  let found: HTMLElement[];
  try {
    found = root.querySelectorAll(rule.selector);
  } catch {
    return { call: rule.label, expected: "", ok: false, got: `неверный селектор ${rule.selector}` };
  }
  const n = found.length;
  if (!rule.exists) return { call: rule.label, expected: "", ok: n === 0, got: n ? `найдено: ${n}` : undefined };

  const need = rule.minCount ?? 1;
  if (n < need) return { call: rule.label, expected: "", ok: false, got: n === 0 ? `не найдено: ${rule.selector}` : `найдено ${n} из ${need}` };
  if (rule.everyHasAttr) {
    const missing = found.filter((el) => !el.hasAttribute(rule.everyHasAttr!)).length;
    if (missing) return { call: rule.label, expected: "", ok: false, got: `без ${rule.everyHasAttr}: ${missing}` };
  }
  if (rule.text !== undefined) {
    const want = rule.text.toLowerCase().replace(/\s+/g, " ").trim();
    const has = found.some((el) => el.textContent.toLowerCase().replace(/\s+/g, " ").includes(want));
    if (!has) return { call: rule.label, expected: "", ok: false, got: `нет текста «${rule.text}»` };
  }
  return { call: rule.label, expected: "", ok: true };
}

export function checkWeb(language: "html" | "css", code: string, rules: HtmlRule[]): TestResult[] {
  const root = language === "html" ? parse(code, { comment: false, blockTextElements: { style: true, script: true, pre: true } }) : null;
  // Стили: весь код (CSS-задача) или содержимое <style> (HTML-задача).
  const css = language === "css" ? code : (root?.querySelectorAll("style").map((s) => s.textContent).join("\n") ?? "");
  const sheet = parseCss(css);
  return rules.map((r) => (r.css ? checkCss(r, sheet) : root ? checkDom(r, root) : { call: r.label, expected: "", ok: false, got: "проверка разметки в CSS-задаче" }));
}

export const htmlRunner: Runner = {
  languages: ["html"],
  run: async (code, checks): Promise<RunOutcome> => ({ results: checkWeb("html", code, checks.rules), error: null }),
};

export const cssRunner: Runner = {
  languages: ["css"],
  run: async (code, checks): Promise<RunOutcome> => ({ results: checkWeb("css", code, checks.rules), error: null }),
};
