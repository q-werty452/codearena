import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { CreateRoomResponse, ServerMessage } from "@codearena/shared";

async function createRoom(): Promise<CreateRoomResponse> {
  const r = await SELF.fetch("http://x/rooms", { method: "POST" });
  expect(r.status).toBe(201);
  return r.json();
}

/** Подключение с очередью входящих сообщений. */
async function connect(code: string, teacher?: string) {
  const q = teacher ? `?teacher=${teacher}` : "";
  const r = await SELF.fetch(`http://x/rooms/${code}/ws${q}`, { headers: { upgrade: "websocket" } });
  expect(r.status).toBe(101);
  const ws = r.webSocket!;
  ws.accept();
  const inbox: ServerMessage[] = [];
  const waiters: Array<() => void> = [];
  ws.addEventListener("message", (e) => {
    inbox.push(JSON.parse(e.data as string));
    waiters.splice(0).forEach((w) => w());
  });
  return {
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    close: () => ws.close(),
    /** Ждёт сообщение нужного типа (и удовлетворяющее условию). */
    async next<T extends ServerMessage["type"]>(type: T, pred: (m: Extract<ServerMessage, { type: T }>) => boolean = () => true) {
      for (let i = 0; i < 100; i++) {
        const idx = inbox.findIndex((m) => m.type === type && pred(m as never));
        if (idx >= 0) return inbox.splice(idx, 1)[0] as Extract<ServerMessage, { type: T }>;
        await new Promise<void>((res) => { waiters.push(res); setTimeout(res, 50); });
      }
      throw new Error(`no ${type}; inbox: ${JSON.stringify(inbox)}`);
    },
  };
}

describe("комнаты и лобби", () => {
  it("создаёт комнату с 6-значным кодом", async () => {
    const { code } = await createRoom();
    expect(code).toMatch(/^\d{6}$/);
    const e = await SELF.fetch(`http://x/rooms/${code}`);
    expect(await e.json()).toEqual({ exists: true });
  });

  it("чужой токен учителя не пускает", async () => {
    const { code } = await createRoom();
    const r = await SELF.fetch(`http://x/rooms/${code}/ws?teacher=nope`, { headers: { upgrade: "websocket" } });
    expect(r.status).toBe(403);
  });

  it("ученик входит, учитель видит его в лобби, повтор имени запрещён", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    await t.next("lobby");

    const s1 = await connect(code);
    s1.send({ type: "join", name: "Айбек К." });
    const j = await s1.next("joined");
    expect(j.team).toBeNull();
    const lobby = await t.next("lobby", (m) => m.players.length === 1);
    expect(lobby.players[0]).toMatchObject({ name: "Айбек К.", connected: true });

    const s2 = await connect(code);
    s2.send({ type: "join", name: "айбек к." });
    const err = await s2.next("error");
    expect(err.code).toBe("name_taken");
  });

  it("переподключение по токену возвращает в ту же команду", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const s = await connect(code);
    s.send({ type: "join", name: "Нурай А." });
    const { playerId, token } = await s.next("joined");
    t.send({ type: "set_teams", mode: "teams2", assignment: { [playerId]: 1 } });
    await t.next("lobby", (m) => m.mode === "teams2" && m.players[0]?.team === 1);
    s.close();

    const again = await connect(code);
    again.send({ type: "join", name: "другое имя", token });
    const j = await again.next("joined");
    expect(j.playerId).toBe(playerId);
    expect(j.team).toBe(1);
  });

  it("выгнанный ученик не возвращается по старому токену", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const s = await connect(code);
    s.send({ type: "join", name: "Бэтмен" });
    const { playerId, token } = await s.next("joined");
    t.send({ type: "kick_player", playerId });
    await s.next("kicked");
    await t.next("lobby", (m) => m.players.length === 0);

    const again = await connect(code);
    again.send({ type: "join", name: "Бэтмен", token });
    await again.next("kicked");
  });

  it("ученик не может управлять комнатой", async () => {
    const { code } = await createRoom();
    const s = await connect(code);
    s.send({ type: "join", name: "Тимур" });
    await s.next("joined");
    s.send({ type: "kick_player", playerId: "x" });
    expect((await s.next("error")).code).toBe("not_teacher");
  });
});
