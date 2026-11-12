import { describe, expect, it } from "vitest";
import { relocateHints } from "./hintTrack.ts";

const h = (line: number, anchor: string) => ({ line, anchor, text: "t" });

describe("подсказка на строке", () => {
  it("строка на месте — подсказка на месте", () => {
    expect(relocateHints([h(1, "<p>Абзац")], ["<h1>", "<p>Абзац", "</body>"])).toEqual([h(1, "<p>Абзац")]);
  });
  it("выше добавили строки — подсказка едет вместе со своей строкой", () => {
    expect(relocateHints([h(1, "<p>Абзац")], ["<h1>", "<!-- новая -->", "<!-- ещё -->", "<p>Абзац"])[0]!.line).toBe(3);
  });
  it("выше удалили строку — тоже находит", () => {
    expect(relocateHints([h(2, "<p>Абзац")], ["<p>Абзац", "</body>"])[0]!.line).toBe(0);
  });
  it("саму строку исправили — подсказка пропадает", () => {
    expect(relocateHints([h(1, "<p>Абзац")], ["<h1>", "<p>Абзац</p>", "</body>"])).toEqual([]);
  });
  it("одинаковые строки — берёт ближайшую", () => {
    expect(relocateHints([h(3, "</div>")], ["</div>", "a", "b", "x", "</div>"])[0]!.line).toBe(4);
  });
});
