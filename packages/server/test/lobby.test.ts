import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { watchToken, type CreateRoomResponse, type ServerMessage } from "@codearena/shared";

let ipCounter = 0;
async function createRoom(): Promise<CreateRoomResponse> {
  // Каждой комнате — свой IP, чтобы не упираться в лимит 10 комнат в минуту.
  const r = await SELF.fetch("http://x/rooms", { method: "POST", headers: { "cf-connecting-ip": `10.0.0.${++ipCounter}` } });
  expect(r.status).toBe(201);
  return r.json();
}

/** Подключение с очередью входящих сообщений. */
async function connect(code: string, teacher?: string, watch?: string) {
  const q = teacher ? `?teacher=${teacher}` : watch ? `?watch=${watch}` : "";
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
    /** Сколько непрочитанных сообщений такого типа лежит во входящих. */
    pending: (type: ServerMessage["type"]) => inbox.filter((m) => m.type === type).length,
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

describe("защита бесплатного лимита", () => {
  it("с одного IP не больше 10 комнат в минуту", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await SELF.fetch("http://x/rooms", { method: "POST", headers: { "cf-connecting-ip": "203.0.113.7" } });
      statuses.push(r.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});

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

describe("викторина через комнату", () => {
  const tasks = [
    { type: "choice", topic: "Python", prompt: "len('hi')?", options: ["1", "2", "3"], correct: 1, explanation: "две буквы" },
    { type: "choice", topic: "Python", prompt: "type(1.0)?", options: ["int", "float"], correct: 1 },
  ];
  const settings = { questionSec: 20 };

  it("полный цикл: старт → вопрос → ответы → показ → итоги", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const a = await connect(code);
    a.send({ type: "join", name: "Айбек К." });
    const ja = await a.next("joined");
    const b = await connect(code);
    b.send({ type: "join", name: "Нурай А." });
    await b.next("joined");

    // Ученик не может запустить игру.
    a.send({ type: "start_game", game: "quiz", settings, tasks });
    expect((await a.next("error")).code).toBe("not_teacher");

    t.send({ type: "start_game", game: "quiz", settings, tasks });
    await a.next("game_started");
    await a.next("state", (m) => m.state.phase === "countdown");

    t.send({ type: "next" }); // пропустить отсчёт
    const task = await a.next("task");
    expect(task.task).not.toHaveProperty("correct");
    expect(task.limitMs).toBe(20_000);

    a.send({ type: "submit", taskId: task.taskId, answer: 1 });
    await a.next("answered");
    const feed = await t.next("teacher_feed");
    expect(feed.event).toMatchObject({ kind: "submission", playerId: ja.playerId, correct: true });

    // Повторный ответ не принимается.
    a.send({ type: "submit", taskId: task.taskId, answer: 0 });
    expect((await a.next("error")).code).toBe("already_answered");

    // Переподключение посреди вопроса: тот же вопрос и «ответ принят».
    a.close();
    const a2 = await connect(code);
    a2.send({ type: "join", name: "Айбек К.", token: ja.token });
    await a2.next("game_started");
    await a2.next("task", (m) => m.taskId === task.taskId);
    await a2.next("answered");

    // Второй ответил — все в сети ответили, показ без ожидания таймера.
    b.send({ type: "submit", taskId: task.taskId, answer: 0 });
    const rv = await a2.next("reveal");
    expect(rv.answer).toBe(1);
    expect(rv.stats).toEqual([1, 1, 0]);
    expect(rv.explanation).toBe("две буквы");
    const ra = await a2.next("result");
    expect(ra.correct).toBe(true);
    expect(ra.points).toBeGreaterThanOrEqual(500);
    expect((await b.next("result")).points).toBe(0);

    t.send({ type: "next" });
    await a2.next("task", (m) => m.index === 1);
    t.send({ type: "end_game" });
    const over = await a2.next("game_over");
    expect(over.leaders[0]!.name).toBe("Айбек К.");

    // Новая игра в той же комнате.
    t.send({ type: "reset_game" });
    await a2.next("game_reset");
  });

  it("в викторине нельзя запустить пустой набор или вопросы без вариантов", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    t.send({ type: "start_game", game: "quiz", settings, tasks: [{ type: "short_answer", topic: "t", prompt: "?", answers: ["1"] }] });
    expect((await t.next("error")).code).toBe("invalid_tasks");
  });
});

describe("канат через комнату", () => {
  const tasks = [
    { type: "short_answer", topic: "t", prompt: "5 + 8", answers: ["13"] },
    { type: "short_answer", topic: "t", prompt: "2 * 3", answers: ["6"] },
  ];

  it("без двух команд не стартует; первый правильный тянет, ошибка блокирует", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const a = await connect(code);
    a.send({ type: "join", name: "Айбек К." });
    const ja = await a.next("joined");
    const b = await connect(code);
    b.send({ type: "join", name: "Нурай А." });
    const jb = await b.next("joined");

    t.send({ type: "start_game", game: "tug", settings: { roundSec: 60, wrongLockSec: 3 }, tasks });
    expect((await t.next("error")).code).toBe("need_two_teams");

    t.send({ type: "set_teams", mode: "teams2", assignment: { [ja.playerId]: 0, [jb.playerId]: 1 } });
    await t.next("lobby", (m) => m.mode === "teams2");
    t.send({ type: "start_game", game: "tug", settings: { roundSec: 60, wrongLockSec: 3 }, tasks });
    await a.next("game_started");
    t.send({ type: "next" }); // пропустить отсчёт
    const task = await a.next("task");
    expect(task.task).not.toHaveProperty("answers"); // ответ не утекает
    await b.next("task");

    b.send({ type: "submit", taskId: task.taskId, answer: "12" });
    const wrong = await b.next("result");
    expect(wrong.correct).toBe(false);
    expect(wrong.lockedUntil).toBeGreaterThan(Date.now());
    b.send({ type: "submit", taskId: task.taskId, answer: "13" });
    expect((await b.next("error")).code).toBe("locked");

    a.send({ type: "submit", taskId: task.taskId, answer: " 13 " });
    expect((await a.next("result")).correct).toBe(true);
    const st = await b.next("state", (m) => m.state.rope === -1);
    expect(st.state.lastPull?.name).toBe("Айбек К.");
    const next = await b.next("task", (m) => m.taskId !== task.taskId);
    expect(next.task.prompt).toBe("2 * 3");

    t.send({ type: "end_game" });
    const over = await a.next("state", (m) => m.state.phase === "over");
    expect(over.state.winner).toBe(0);
  });
});

describe("урок — режим комнаты по умолчанию", () => {
  it("статусы учеников видит учитель, «объясните» — только числом и один раз на шаг", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const first = await t.next("lesson_state");
    expect(first).toMatchObject({ checkpoint: 0, statuses: {}, confused: 0 });

    const a = await connect(code);
    a.send({ type: "join", name: "Айбек К." });
    const ja = await a.next("joined");
    expect(await a.next("lesson_me")).toMatchObject({ status: "writing", confused: false });
    const b = await connect(code);
    b.send({ type: "join", name: "Нурай А." });
    const jb = await b.next("joined");

    a.send({ type: "status", status: "done" });
    expect(await a.next("lesson_me", (m) => m.status === "done")).toBeTruthy();
    const st = await t.next("lesson_state", (m) => m.statuses[ja.playerId] === "done");
    expect(st.statuses[jb.playerId]).toBe("writing");

    b.send({ type: "confused" });
    b.send({ type: "confused" }); // повтор не накручивает счётчик
    a.send({ type: "confused" });
    const conf = await t.next("lesson_state", (m) => m.confused === 2);
    expect(JSON.stringify(conf)).not.toContain("confusedBy"); // имён нет
    expect(await b.next("lesson_me", (m) => m.confused)).toBeTruthy();

    // Новый шаг: все снова «пишут», счётчик обнулён.
    t.send({ type: "checkpoint_set" });
    const cp = await t.next("lesson_state", (m) => m.checkpoint === 1);
    expect(cp).toMatchObject({ confused: 0, statuses: { [ja.playerId]: "writing", [jb.playerId]: "writing" } });
    expect(await a.next("lesson_me", (m) => m.checkpoint === 1)).toMatchObject({ status: "writing", confused: false });

    // Ученик не может начать новый шаг.
    a.send({ type: "checkpoint_set" });
    expect((await a.next("error")).code).toBe("not_teacher");
  });

  it("после игры комната возвращается в урок с теми же статусами", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    const a = await connect(code);
    a.send({ type: "join", name: "Тимур Б." });
    const ja = await a.next("joined");
    a.send({ type: "status", status: "lost" });
    await t.next("lesson_state", (m) => m.statuses[ja.playerId] === "lost");
    t.send({ type: "start_game", game: "quiz", settings: {}, tasks: [{ type: "choice", topic: "t", prompt: "?", options: ["a", "b"], correct: 0 }] });
    await a.next("game_started");
    t.send({ type: "end_game" });
    await a.next("game_over");
    t.send({ type: "reset_game" });
    await a.next("game_reset");
    // Переподключение учителя: урок на месте.
    const t2 = await connect(code, teacherToken);
    expect((await t2.next("lesson_state")).statuses[ja.playerId]).toBe("lost");
  });
});

describe("урок, часть 2: код учителя, чекпоинты, прогресс", () => {
  it("трансляция, эталон чекпоинта, проценты учителю, код ученика по запросу", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    await t.next("lesson_state");

    // Учитель начал показывать файл до прихода ученика — поздний ученик получает его при входе.
    t.send({ type: "lesson_share", fileName: "index.html", lang: "html", text: "<ul>\n  <li>1</li>\n</ul>", line: 1 });
    const a = await connect(code);
    a.send({ type: "join", name: "Айбек К." });
    const ja = await a.next("joined");
    expect(await a.next("lesson_share")).toMatchObject({ fileName: "index.html", line: 1, version: 1 });

    t.send({ type: "lesson_share", fileName: "index.html", lang: "html", text: "<ul>\n  <li>1</li>\n  <li>2</li>\n</ul>", line: 2 });
    expect((await a.next("lesson_share")).version).toBe(2);

    // Чекпоинт: эталон уходит ученикам, проценты сбрасываются.
    t.send({ type: "checkpoint_set", code: "<ul>\n  <li>1</li>\n  <li>2</li>\n</ul>", fileName: "index.html" });
    const cp = await a.next("checkpoint");
    expect(cp).toMatchObject({ checkpoint: 1, fileName: "index.html" });
    a.send({ type: "progress", checkpoint: 0, percent: 90 }); // старый шаг — игнор
    a.send({ type: "progress", checkpoint: 1, percent: 50 });
    const st = await t.next("lesson_state", (m) => m.progress[ja.playerId] === 50);
    expect(st.checkpoint).toBe(1);

    // Учитель смотрит код ученика.
    t.send({ type: "peek", playerId: ja.playerId });
    await a.next("peek_request");
    a.send({ type: "peek_reply", fileName: "index.html", text: "<ul><li>1</li>" });
    expect(await t.next("peek_code")).toMatchObject({ playerId: ja.playerId, name: "Айбек К.", text: "<ul><li>1</li>" });

    // Новый чекпоинт обнуляет проценты; остановка показа.
    t.send({ type: "checkpoint_set", code: "x" });
    expect((await t.next("lesson_state", (m) => m.checkpoint === 2)).progress).toEqual({});
    t.send({ type: "lesson_share_stop" });
    await a.next("lesson_share_off");

    // Ученик не может показывать код и смотреть чужой.
    a.send({ type: "peek", playerId: ja.playerId });
    expect((await a.next("error")).code).toBe("not_teacher");
  });
});

describe("смотреть с телефона", () => {
  it("страница /w/<код> отдаётся без кэша и без индексации", async () => {
    const r = await SELF.fetch("http://x/w/123456");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toContain("text/html");
    expect(r.headers.get("cache-control")).toBe("no-store");
    const html = await r.text();
    expect(html).toContain('const CODE = "123456"');
    expect(html).toContain("noindex");
  });

  it("чужой токен наблюдателя и токен учителя вместо него не пускают", async () => {
    const { code, teacherToken } = await createRoom();
    const bad = await SELF.fetch(`http://x/rooms/${code}/ws?watch=${"0".repeat(32)}`, { headers: { upgrade: "websocket" } });
    expect(bad.status).toBe(403);
    const raw = await SELF.fetch(`http://x/rooms/${code}/ws?watch=${teacherToken}`, { headers: { upgrade: "websocket" } });
    expect(raw.status).toBe(403);
  });

  it("наблюдатель видит то же, что учитель, но ничего не может изменить", async () => {
    const { code, teacherToken } = await createRoom();
    const t = await connect(code, teacherToken);
    await t.next("lobby");
    const w = await connect(code, undefined, await watchToken(teacherToken));
    expect((await w.next("lobby")).players).toEqual([]);
    await w.next("lesson_state");

    const a = await connect(code);
    a.send({ type: "join", name: "Айбек К." });
    const ja = await a.next("joined");
    expect((await w.next("lobby", (m) => m.players.length === 1)).players[0]!.name).toBe("Айбек К.");
    a.send({ type: "status", status: "lost" });
    await w.next("lesson_state", (m) => m.statuses[ja.playerId] === "lost");
    a.send({ type: "confused" });
    await w.next("lesson_state", (m) => m.confused === 1);
    a.send({ type: "progress", checkpoint: 0, percent: 40 });
    await w.next("lesson_state", (m) => m.progress[ja.playerId] === 40);

    // Код ученика: телефон просит — получает только телефон, у учителя в VS Code ничего не открывается.
    w.send({ type: "peek", playerId: ja.playerId });
    await a.next("peek_request");
    a.send({ type: "peek_reply", fileName: "index.html", text: "<h1>Привет</h1>" });
    expect((await w.next("peek_code")).text).toBe("<h1>Привет</h1>");
    // И наоборот: учитель смотрит из VS Code — телефону не приходит.
    t.send({ type: "peek", playerId: ja.playerId });
    await a.next("peek_request");
    a.send({ type: "peek_reply", fileName: "index.html", text: "v2" });
    expect((await t.next("peek_code")).text).toBe("v2");
    await new Promise((r) => setTimeout(r, 150));
    w.send({ type: "kick_player", playerId: ja.playerId });
    expect((await w.next("error")).code).toBe("not_teacher");
    // До этого момента учителю пришёл ровно один peek_code, телефону — ровно один.
    expect(t.pending("peek_code")).toBe(0);
    expect(w.pending("peek_code")).toBe(0);

    // Подсказка на строке: с телефона и из VS Code доходит до ученика, отправивший получает подтверждение.
    w.send({ type: "hint", playerId: ja.playerId, line: 3, text: "  закрой тег  ", fileName: "index.html" });
    expect(await a.next("hint")).toMatchObject({ line: 3, text: "закрой тег", fileName: "index.html" });
    expect(await w.next("hint_sent")).toMatchObject({ playerId: ja.playerId, line: 3 });
    t.send({ type: "hint", playerId: ja.playerId, line: 1, text: "добавь doctype" });
    expect(await a.next("hint")).toMatchObject({ line: 1, text: "добавь doctype", fileName: "" });
    await t.next("hint_sent");
    // Ученик подсказки другим не шлёт; пустая подсказка и строка 0 — не проходят.
    a.send({ type: "hint", playerId: ja.playerId, line: 1, text: "x" });
    expect((await a.next("error")).code).toBe("not_teacher");
    t.send({ type: "hint", playerId: ja.playerId, line: 0, text: "x" });
    expect((await t.next("error")).code).toBe("bad_message");
    t.send({ type: "hint", playerId: ja.playerId, line: 2, text: "   " });
    expect((await t.next("error")).code).toBe("bad_message");

    // Команды учителя от наблюдателя не проходят и комнату не меняют.
    w.send({ type: "kick_player", playerId: ja.playerId });
    expect((await w.next("error")).code).toBe("not_teacher");
    w.send({ type: "close_room" });
    expect((await w.next("error")).code).toBe("not_teacher");
    const e = await SELF.fetch(`http://x/rooms/${code}`);
    expect(await e.json()).toEqual({ exists: true });

    // Игру видит вживую: старт, состояние, итоги.
    t.send({ type: "start_game", game: "quiz", settings: {}, tasks: [{ type: "choice", topic: "t", prompt: "?", options: ["a", "b"], correct: 0 }] });
    expect((await w.next("game_started")).game).toBe("quiz");
    expect((await w.next("state")).state.game).toBe("quiz");
    t.send({ type: "end_game" });
    await w.next("game_over");
  });
});
