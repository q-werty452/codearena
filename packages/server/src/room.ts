import { DurableObject } from "cloudflare:workers";
import {
  DEFAULT_TEAM_NAMES,
  LIMITS,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type LessonStatus,
  type PlayerInfo,
  type ServerMessage,
  type TeamIndex,
  type TeamMode,
  watchToken,
} from "@codearena/shared";
import type { Env } from "./index.ts";
import * as engine from "./engine.ts";
import { GameError, type Effect, type EngineEnv, type GameData } from "./engine.ts";

/** Игрок в хранилище комнаты (токен никогда не уходит другим клиентам). */
interface StoredPlayer {
  id: string;
  name: string;
  team: TeamIndex | null;
  token: string;
  joinedAt: number;
}

interface RoomData {
  code: string;
  teacherToken: string;
  createdAt: number;
  lastActivity: number;
  mode: TeamMode;
  teamNames: string[];
  players: Record<string, StoredPlayer>;
  /** Токены выгнанных — с ними обратно не пустит. */
  kicked: string[];
  /** Текущая игра (null — урок: режим комнаты по умолчанию). */
  game: GameData | null;
  /** Урок: номер шага, статусы учеников, кто нажал «объясните ещё раз» (учителю — только число). */
  lesson: LessonData;
}

interface LessonData {
  checkpoint: number;
  statuses: Record<string, LessonStatus>;
  confusedBy: string[];
  /** Процент учеников по текущему чекпоинту. */
  progress?: Record<string, number>;
  /** Эталон текущего чекпоинта (код учителя на момент «Чекпоинт»). */
  refCode?: string;
  refFile?: string;
}

/** Показываемый файл учителя. В памяти — каждое обновление, в хранилище — не чаще раза в 10 с. */
interface ShareData {
  fileName: string;
  lang: string;
  text: string;
  line: number;
  version: number;
}

const newLesson = (): LessonData => ({ checkpoint: 0, statuses: {}, confusedBy: [], progress: {} });
const SHARE_PERSIST_MS = 10_000;
const PROGRESS_PERSIST_MS = 15_000;

/** Что привязано к каждому WebSocket (переживает гибернацию). */
/** watcher — «смотреть с телефона»: получает то же, что учитель, но ничего не может менять. */
type Attachment = { role: "teacher" } | { role: "watcher" } | { role: "student"; playerId: string | null };

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;
  private share: ShareData | null = null;
  private sharePersistedAt = 0;
  private progressPersistedAt = 0;
  /** Кто просил код ученика (учитель в VS Code или телефон) — ответ уходит только им. */
  private peekWaiters = new Map<string, Set<WebSocket>>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<RoomData>("room")) ?? null;
      if (this.data) {
        this.data.game ??= null;
        this.data.lesson ??= newLesson();
        this.data.lesson.progress ??= {};
      }
      this.share = (await ctx.storage.get<ShareData>("share")) ?? null;
    });
    // Автоответ на ping без пробуждения объекта — не тратит лимит.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong","t":0}'));
  }

  /* ─────────────── RPC из Worker'а ─────────────── */

  async init(code: string, teacherToken: string): Promise<boolean> {
    if (this.data) return false; // код занят
    const now = Date.now();
    this.data = {
      code,
      teacherToken,
      createdAt: now,
      lastActivity: now,
      mode: "solo",
      teamNames: [...DEFAULT_TEAM_NAMES.ru],
      players: {},
      kicked: [],
      game: null,
      lesson: newLesson(),
    };
    await this.save();
    return true;
  }

  async exists(): Promise<boolean> {
    return this.data !== null;
  }

  /* ─────────────── WebSocket ─────────────── */

  override async fetch(request: Request): Promise<Response> {
    if (!this.data) return new Response("room_not_found", { status: 404 });
    const url = new URL(request.url);
    const teacher = url.searchParams.get("teacher");
    if (teacher !== null && teacher !== this.data.teacherToken) {
      return new Response("not_teacher", { status: 403 });
    }
    const watch = url.searchParams.get("watch");
    if (watch !== null && watch !== (await watchToken(this.data.teacherToken))) {
      return new Response("not_watcher", { status: 403 });
    }

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const att: Attachment = teacher ? { role: "teacher" } : watch ? { role: "watcher" } : { role: "student", playerId: null };
    // Наблюдатель помечен и тегом "teacher": всё, что уходит учителю, видит и он.
    this.ctx.acceptWebSocket(server, att.role === "watcher" ? ["teacher", "watcher"] : [att.role]);
    server.serializeAttachment(att);

    if (att.role === "teacher" || att.role === "watcher") {
      // Учитель сразу видит лобби.
      queueMicrotask(() => {
        this.send(server, this.lobbyMessage());
        this.send(server, this.lessonState());
        const g = this.data?.game;
        if (g) for (const m of engine.resumeFor(g, this.gameEnv(), null)) this.send(server, m);
      });
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.data) return this.closeSocket(ws, "room_not_found");
    if (typeof raw !== "string" || raw.length > 64_000) return this.error(ws, "bad_message", "Неверное сообщение");
    const msg = parseClientMessage(raw);
    if (!msg) return this.error(ws, "bad_message", "Неверное сообщение");

    const att = ws.deserializeAttachment() as Attachment;
    // Наблюдатель только смотрит: может лишь попросить код ученика, остальное — нет.
    if (att.role === "watcher") {
      if (msg.type === "peek") return this.peek(ws, msg.playerId);
      if (msg.type === "hint") return this.hint(ws, msg);
      return this.error(ws, "not_teacher", "Только просмотр");
    }
    this.data.lastActivity = Date.now();

    if (att.role === "teacher") await this.onTeacher(ws, msg);
    else await this.onStudent(ws, att, msg);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    if (!this.data) return; // комната уже закрыта
    const att = ws.deserializeAttachment() as Attachment | null;
    // Игрок остаётся в комнате — просто помечается «не в сети».
    if (att?.role === "student" && att.playerId) this.broadcastLobby();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  override async alarm(): Promise<void> {
    if (!this.data) return;
    if (Date.now() - this.data.lastActivity >= LIMITS.roomIdleMs) {
      await this.destroy();
      return;
    }
    // Таймер игры: закончился отсчёт или время на вопрос.
    const g = this.data.game;
    if (g?.deadline !== null && g?.deadline !== undefined && Date.now() >= g.deadline) {
      this.dispatch(engine.onDeadline(g, this.gameEnv()));
    }
    await this.save();
  }

  /* ─────────────── Учитель ─────────────── */

  private async onTeacher(ws: WebSocket, msg: ClientMessage): Promise<void> {
    const d = this.data!;
    switch (msg.type) {
      case "set_teams": {
        d.mode = msg.mode;
        const maxTeam = msg.mode === "teams2" ? 1 : msg.mode === "teams3" ? 2 : -1;
        for (const p of Object.values(d.players)) {
          const t = msg.assignment[p.id];
          p.team = maxTeam < 0 || t === undefined || t === null || t > maxTeam ? null : t;
        }
        await this.save();
        this.broadcastLobby();
        return;
      }
      case "rename_team": {
        d.teamNames[msg.team] = msg.name;
        await this.save();
        this.broadcastLobby();
        return;
      }
      case "rename_player": {
        const p = d.players[msg.playerId];
        if (!p) return;
        if (this.nameTaken(msg.name, p.id)) return this.error(ws, "name_taken", "Такое имя уже есть");
        p.name = msg.name;
        await this.save();
        this.broadcastLobby();
        return;
      }
      case "kick_player": {
        const p = d.players[msg.playerId];
        if (!p) return;
        d.kicked.push(p.token);
        delete d.players[p.id];
        delete d.lesson.statuses[p.id];
        delete d.lesson.progress?.[p.id];
        d.lesson.confusedBy = d.lesson.confusedBy.filter((id) => id !== p.id);
        for (const s of this.studentSockets(p.id)) {
          this.send(s, { type: "kicked" });
          s.close(4001, "kicked");
        }
        await this.save();
        this.broadcastLobby();
        this.sendLessonToTeacher();
        return;
      }
      case "close_room": {
        await this.destroy();
        return;
      }
      case "checkpoint_set": {
        // Новый шаг урока: все снова «пишут», счётчик «не поняли» обнуляется.
        d.lesson = {
          checkpoint: d.lesson.checkpoint + 1,
          statuses: {},
          confusedBy: [],
          progress: {},
          refCode: msg.code,
          refFile: msg.fileName ?? this.share?.fileName,
        };
        await this.save();
        const ref = this.checkpointMsg();
        for (const s of this.studentSockets()) {
          const a = s.deserializeAttachment() as Attachment;
          if (a.role !== "student" || !a.playerId) continue;
          this.send(s, this.lessonMe(a.playerId));
          if (ref) this.send(s, ref);
        }
        this.sendLessonToTeacher();
        return;
      }
      case "lesson_share": {
        const version = (this.share?.version ?? 0) + 1;
        this.share = { fileName: msg.fileName, lang: msg.lang, text: msg.text, line: msg.line, version };
        const raw = JSON.stringify({ type: "lesson_share", ...this.share } satisfies ServerMessage);
        for (const s of this.studentSockets()) this.sendRaw(s, raw);
        // В хранилище — не на каждое обновление: экономим бесплатный лимит записей.
        if (Date.now() - this.sharePersistedAt > SHARE_PERSIST_MS) {
          this.sharePersistedAt = Date.now();
          await this.ctx.storage.put("share", this.share);
        }
        return;
      }
      case "lesson_share_stop": {
        this.share = null;
        await this.ctx.storage.delete("share");
        for (const s of this.studentSockets()) this.send(s, { type: "lesson_share_off" });
        return;
      }
      case "peek":
        return this.peek(ws, msg.playerId);
      case "hint":
        return this.hint(ws, msg);
      case "start_game": {
        if (d.game && d.game.phase !== "over") return this.error(ws, "game_running", "Игра уже идёт");
        try {
          d.game = engine.startGame(msg.game, msg.tasks, msg.settings, Date.now(), d.mode);
        } catch (e) {
          if (e instanceof GameError) return this.error(ws, e.code, e.message);
          throw e;
        }
        this.dispatch(engine.startEffects(d.game, this.gameEnv()));
        await this.save();
        return;
      }
      case "pause":
      case "resume":
      case "next":
      case "end_game": {
        const g = d.game;
        if (!g || g.phase === "over") return this.error(ws, "no_game", "Игра не идёт");
        const env = this.gameEnv();
        const fx =
          msg.type === "pause" ? engine.pause(g, env)
          : msg.type === "resume" ? engine.resume(g, env)
          : msg.type === "next" ? engine.next(g, env)
          : engine.finish(g, env);
        this.dispatch(fx);
        await this.save();
        return;
      }
      case "reset_game": {
        d.game = null;
        this.broadcast({ type: "game_reset" });
        await this.save();
        this.broadcastLobby();
        return;
      }
      case "ping":
        return this.send(ws, { type: "pong", t: Date.now() });
      default:
        // Игровые сообщения появятся на следующих этапах.
        return this.error(ws, "no_game", "Скоро будет");
    }
  }

  /* ─────────────── Ученик ─────────────── */

  private async onStudent(ws: WebSocket, att: Extract<Attachment, { role: "student" }>, msg: ClientMessage): Promise<void> {
    const d = this.data!;
    if (msg.type === "ping") return this.send(ws, { type: "pong", t: Date.now() });

    if (msg.type === "join") {
      if (msg.token && d.kicked.includes(msg.token)) {
        this.send(ws, { type: "kicked" });
        return ws.close(4001, "kicked");
      }
      // Переподключение: тот же токен — тот же игрок, команда и очки.
      let player = msg.token ? Object.values(d.players).find((p) => p.token === msg.token) : undefined;
      if (!player) {
        if (Object.keys(d.players).length >= LIMITS.maxPlayers) {
          return this.error(ws, "bad_message", "Комната заполнена");
        }
        if (this.nameTaken(msg.name)) {
          return this.error(ws, "name_taken", "Такое имя уже есть — допиши фамилию");
        }
        player = {
          id: crypto.randomUUID().slice(0, 8),
          name: msg.name,
          team: null,
          token: crypto.randomUUID(),
          joinedAt: Date.now(),
        };
        d.players[player.id] = player;
        await this.save();
      }
      // Старые сокеты этого игрока закрываем (открыл второй VS Code).
      for (const s of this.studentSockets(player.id)) if (s !== ws) s.close(4002, "replaced");
      ws.serializeAttachment({ role: "student", playerId: player.id } satisfies Attachment);
      this.send(ws, { type: "joined", playerId: player.id, token: player.token, team: player.team });
      this.send(ws, this.lessonMe(player.id));
      if (this.share) this.send(ws, { type: "lesson_share", ...this.share });
      const ref = this.checkpointMsg();
      if (ref) this.send(ws, ref);
      this.broadcastLobby();
      this.sendLessonToTeacher();
      // Игра уже идёт — вернуть ученика в то же место.
      if (d.game) for (const m of engine.resumeFor(d.game, this.gameEnv(), player.id)) this.send(ws, m);
      return;
    }

    if (!att.playerId || !d.players[att.playerId]) return this.error(ws, "not_joined", "Сначала войди в комнату");

    if (msg.type === "status" || msg.type === "confused") {
      const pid = att.playerId;
      if (msg.type === "status") d.lesson.statuses[pid] = msg.status;
      else if (!d.lesson.confusedBy.includes(pid)) d.lesson.confusedBy.push(pid); // один раз на шаг
      await this.save();
      for (const s of this.studentSockets(pid)) this.send(s, this.lessonMe(pid));
      this.sendLessonToTeacher();
      return;
    }

    if (msg.type === "progress") {
      if (msg.checkpoint !== d.lesson.checkpoint) return; // устаревший шаг
      d.lesson.progress ??= {};
      d.lesson.progress[att.playerId] = Math.round(msg.percent);
      this.sendLessonToTeacher();
      if (Date.now() - this.progressPersistedAt > PROGRESS_PERSIST_MS) {
        this.progressPersistedAt = Date.now();
        await this.save();
      }
      return;
    }

    if (msg.type === "peek_reply") {
      const name = d.players[att.playerId]?.name ?? "?";
      const reply: ServerMessage = { type: "peek_code", playerId: att.playerId, name, fileName: msg.fileName, text: msg.text };
      const waiters = [...(this.peekWaiters.get(att.playerId) ?? [])].filter((s) => s.readyState === WebSocket.OPEN);
      this.peekWaiters.delete(att.playerId);
      // Запрос мог потеряться при гибернации — тогда как раньше: учителю (не телефону).
      const to = waiters.length
        ? waiters
        : this.ctx.getWebSockets("teacher").filter((s) => (s.deserializeAttachment() as Attachment | null)?.role === "teacher");
      for (const s of to) this.send(s, reply);
      return;
    }

    if (msg.type === "flag") {
      if (!d.game) return; // в уроке анти-чит выключен
      this.dispatch(engine.flag(d.game, att.playerId, msg.kind, msg.detail));
      await this.save();
      return;
    }

    if (msg.type === "submit") {
      if (!d.game) return this.error(ws, "no_game", "Игра не идёт");
      try {
        this.dispatch(engine.submit(d.game, this.gameEnv(), att.playerId, msg.taskId, msg.answer, { code: msg.code, report: msg.report }));
      } catch (e) {
        if (e instanceof GameError) return this.error(ws, e.code, e.message);
        throw e;
      }
      await this.save();
      return;
    }
    return this.error(ws, "not_teacher", "Это может только учитель");
  }

  /* ─────────────── Урок ─────────────── */

  /** Подсказка ученику на строке его кода. Отправившему — подтверждение. */
  private hint(ws: WebSocket, msg: Extract<ClientMessage, { type: "hint" }>): void {
    const sockets = this.studentSockets(msg.playerId);
    if (!sockets.length) return this.error(ws, "not_joined", "Ученик не в сети");
    for (const s of sockets) this.send(s, { type: "hint", line: msg.line, text: msg.text, fileName: msg.fileName ?? "" });
    this.send(ws, { type: "hint_sent", playerId: msg.playerId, line: msg.line, text: msg.text });
  }

  /** Попросить у ученика его код. Ответ получит только тот, кто просил. */
  private peek(ws: WebSocket, playerId: string): void {
    const sockets = this.studentSockets(playerId);
    if (!sockets.length) return this.error(ws, "not_joined", "Ученик не в сети");
    let set = this.peekWaiters.get(playerId);
    if (!set) this.peekWaiters.set(playerId, (set = new Set()));
    set.add(ws);
    for (const s of sockets) this.send(s, { type: "peek_request" });
  }

  /** Сводка для учителя. Кто именно просил объяснить — не раскрывается. */
  private lessonState(): ServerMessage {
    const d = this.data!;
    const statuses: Record<string, LessonStatus> = {};
    for (const id of Object.keys(d.players)) statuses[id] = d.lesson.statuses[id] ?? "writing";
    return { type: "lesson_state", checkpoint: d.lesson.checkpoint, statuses, confused: d.lesson.confusedBy.length, progress: d.lesson.progress ?? {} };
  }

  private checkpointMsg(): ServerMessage | null {
    const l = this.data!.lesson;
    if (l.refCode === undefined) return null;
    return { type: "checkpoint", checkpoint: l.checkpoint, fileName: l.refFile ?? "", code: l.refCode };
  }

  private lessonMe(playerId: string): ServerMessage {
    const l = this.data!.lesson;
    return { type: "lesson_me", checkpoint: l.checkpoint, status: l.statuses[playerId] ?? "writing", confused: l.confusedBy.includes(playerId) };
  }

  private sendLessonToTeacher(): void {
    const msg = this.lessonState();
    for (const s of this.ctx.getWebSockets("teacher")) this.send(s, msg);
  }

  /* ─────────────── Игра ─────────────── */

  private gameEnv(): EngineEnv {
    const d = this.data!;
    return {
      now: Date.now(),
      players: Object.values(d.players)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({ id: p.id, name: p.name, team: p.team })),
      online: this.onlineIds(),
      mode: d.mode,
    };
  }

  /** Разослать эффекты движка по адресатам. */
  private dispatch(effects: Effect[]): void {
    for (const { to, msg } of effects) {
      if (to === "all") this.broadcast(msg);
      else if (to === "teacher") for (const s of this.ctx.getWebSockets("teacher")) this.send(s, msg);
      else if (to === "students") for (const s of this.studentSockets()) this.send(s, msg);
      else for (const s of this.studentSockets(to.player)) this.send(s, msg);
    }
  }

  private broadcast(msg: ServerMessage): void {
    const raw = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a?.role === "teacher" || a?.role === "watcher" || (a?.role === "student" && a.playerId)) this.sendRaw(s, raw);
    }
  }

  /* ─────────────── Утилиты ─────────────── */

  private nameTaken(name: string, exceptId?: string): boolean {
    const n = name.toLocaleLowerCase();
    return Object.values(this.data!.players).some((p) => p.id !== exceptId && p.name.toLocaleLowerCase() === n);
  }

  private studentSockets(playerId?: string): WebSocket[] {
    return this.ctx.getWebSockets("student").filter((s) => {
      const a = s.deserializeAttachment() as Attachment | null;
      return a?.role === "student" && a.playerId !== null && (playerId === undefined || a.playerId === playerId);
    });
  }

  private onlineIds(): Set<string> {
    const ids = new Set<string>();
    for (const s of this.studentSockets()) {
      const a = s.deserializeAttachment() as Attachment;
      if (a.role === "student" && a.playerId && s.readyState === WebSocket.OPEN) ids.add(a.playerId);
    }
    return ids;
  }

  private lobbyMessage(): ServerMessage {
    const d = this.data!;
    const online = this.onlineIds();
    const players: PlayerInfo[] = Object.values(d.players)
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, team: p.team, connected: online.has(p.id) }));
    const teamCount = d.mode === "teams2" ? 2 : d.mode === "teams3" ? 3 : 0;
    return {
      type: "lobby",
      code: d.code,
      mode: d.mode,
      teams: d.teamNames.slice(0, teamCount).map((name, i) => ({ index: i as TeamIndex, name })),
      players,
    };
  }

  private broadcastLobby(): void {
    const msg = JSON.stringify(this.lobbyMessage());
    for (const s of this.ctx.getWebSockets()) {
      const a = s.deserializeAttachment() as Attachment | null;
      if (a?.role === "teacher" || a?.role === "watcher" || (a?.role === "student" && a.playerId)) this.sendRaw(s, msg);
    }
  }

  private send(ws: WebSocket, msg: ServerMessage): void {
    this.sendRaw(ws, JSON.stringify(msg));
  }

  private sendRaw(ws: WebSocket, msg: string): void {
    try {
      ws.send(msg);
    } catch {
      /* сокет уже закрыт */
    }
  }

  private error(ws: WebSocket, code: ErrorCode, message: string): void {
    this.send(ws, { type: "error", code, message });
  }

  private closeSocket(ws: WebSocket, reason: string): void {
    try {
      ws.close(4004, reason);
    } catch {
      /* уже закрыт */
    }
  }

  private async save(): Promise<void> {
    if (!this.data) return;
    await this.ctx.storage.put("room", this.data);
    const idle = this.data.lastActivity + LIMITS.roomIdleMs;
    const deadline = this.data.game?.deadline ?? Infinity;
    await this.ctx.storage.setAlarm(Math.min(idle, deadline));
  }

  private async destroy(): Promise<void> {
    for (const s of this.ctx.getWebSockets()) {
      this.send(s, { type: "room_closed" });
      this.closeSocket(s, "room_closed");
    }
    this.data = null;
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}
