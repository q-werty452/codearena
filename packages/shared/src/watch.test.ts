import { describe, expect, it } from "vitest";
import { watchToken, watchUrl } from "./watch.ts";

describe("ссылка «смотреть с телефона»", () => {
  it("токен наблюдателя — 32 hex, один и тот же для учителя и разный для разных комнат", async () => {
    const a = await watchToken("teacher-a");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(await watchToken("teacher-a")).toBe(a);
    expect(await watchToken("teacher-b")).not.toBe(a);
    expect(a).not.toContain("teacher");
  });
  it("токен во фрагменте ссылки, лишний слэш у сервера не мешает", () => {
    expect(watchUrl("https://s.dev/", "123456", "ab")).toBe("https://s.dev/w/123456#t=ab");
  });
});
