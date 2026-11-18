import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Каждое сообщение, которое умеет применять состояние игры (applyGameMessage),
 * расширение обязано туда передавать. Раньше teacher_feed и flags терялись:
 * у учителя все ученики «думали», а нарушения анти-чита не показывались.
 */
const cases = (src: string) => new Set([...src.matchAll(/case "([a-z_]+)"/g)].map((m) => m[1]!));

describe("сообщения игры доходят до панели", () => {
  it("всё, что знает applyGameMessage, передаётся из session.ts", () => {
    const host = readFileSync(join(__dirname, "../../shared/src/host.ts"), "utf8");
    const reducer = host.slice(host.indexOf("export function applyGameMessage"));
    const body = reducer.slice(0, reducer.indexOf("\n}\n"));
    const session = readFileSync(join(__dirname, "session.ts"), "utf8");
    const routed = session.slice(session.indexOf('case "game_started"'), session.indexOf("applyGameMessage(this.state.game"));
    const missing = [...cases(body)].filter((c) => !cases(routed).has(c));
    expect(missing).toEqual([]);
  });
});
