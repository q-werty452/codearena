import { inflateRawSync } from "node:zlib";

/**
 * Текст из .docx без зависимостей: docx — это zip, текст лежит в word/document.xml.
 * Абзацы → строки. Нумерованный список Word (номера не хранятся в тексте):
 * уровень 0 → «1. вопрос», уровень 1+ → «- вариант»; вариант целиком жирным → «+ вариант»
 * (учителя часто выделяют правильный ответ жирным).
 */
export function docxToText(buf: Uint8Array): string {
  const xml = unzipEntry(buf, "word/document.xml");
  if (!xml) throw new Error("not a docx");
  return documentXmlToText(new TextDecoder().decode(xml));
}

export function documentXmlToText(xml: string): string {
  const lines: string[] = [];
  let n = 0;
  for (const p of xml.match(/<w:p[ >][\s\S]*?<\/w:p>|<w:p\/>/g) ?? []) {
    const runs = p.match(/<w:r[ >][\s\S]*?<\/w:r>/g) ?? [];
    let text = "";
    let allBold = runs.length > 0;
    let anyText = false;
    for (const r of runs) {
      const t = (r.match(/<w:t(?: [^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>/g) ?? [])
        .map((x) => (x === "<w:tab/>" ? "\t" : x === "<w:br/>" ? "\n" : x.replace(/<[^>]+>/g, "")))
        .join("");
      if (t.trim()) {
        anyText = true;
        if (!/<w:b\/>|<w:b w:val="(?:1|true)"\/>/.test(r)) allBold = false;
      }
      text += t;
    }
    text = decodeXml(text);
    const level = /<w:numPr>[\s\S]*?<w:ilvl w:val="(\d+)"/.exec(p)?.[1];
    const isList = /<w:numPr>/.test(p);
    if (isList && text.trim()) {
      if (level === undefined || level === "0") {
        n++;
        text = `${n}. ${text.trim()}`;
      } else text = `${allBold && anyText ? "+" : "-"} ${text.trim()}`;
    }
    lines.push(text);
  }
  return lines.join("\n");
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, "&");
}

/** Один файл из zip-архива (центральный каталог → локальный заголовок → deflate). */
export function unzipEntry(buf: Uint8Array, name: string): Uint8Array | null {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  for (let k = 0; k < count && p + 46 <= buf.length; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) return null;
    const method = dv.getUint16(p + 10, true);
    const size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const entry = dec.decode(buf.subarray(p + 46, p + 46 + nameLen));
    if (entry === name) {
      const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
      const data = buf.subarray(start, start + size);
      if (method === 0) return data;
      if (method === 8) return new Uint8Array(inflateRawSync(data));
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}
