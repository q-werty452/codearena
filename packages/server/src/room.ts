import { DurableObject } from "cloudflare:workers";
import {
  DEFAULT_TEAM_NAMES,
  LIMITS,
  parseClientMessage,
  type ClientMessage,
  type ErrorCode,
  type PlayerInfo,
  type ServerMessage,
  type TeamIndex,
  type TeamMode,
} from "@codearena/shared";
import type { Env } from "./index.ts";

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
}

/** Что привязано к каждому WebSocket (переживает гибернацию). */
type Attachment = { role: "teacher" } | { role: "student"; playerId: string | null };

export class Room extends DurableObject<Env> {
  private data: RoomData | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.data = (await ctx.storage.get<RoomData>("room")) ?? null;
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

    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];
    const att: Attachment = teacher ? { role: "teacher" } : { role: "student", playerId: null };
    this.ctx.acceptWebSocket(server, [att.role]);
    server.serializeAttachment(att);

    if (att.role === "teacher") {
      // Учитель сразу видит лобби.
      queueMicrotask(() => this.send(server, this.lobbyMessage()));
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.data) return this.closeSocket(ws, "room_not_found");
    if (typeof raw !== "string" || raw.length > 64_000) return this.error(ws, "bad_message", "Неверное сообщение");
    const msg = parseClientMessage(raw);
    if (!msg) return this.error(ws, "bad_message", "Неверное сообщение");

    const att = ws.deserializeAttachment() as Attachment;
    this.data.lastActivity = Date.now();

    if (att.role === "teacher") await this.onTeacher(ws, msg);
    else await this.onStudent(ws, att, msg);
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
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
    } else {
      await this.ctx.storage.setAlarm(this.data.lastActivity + LIMITS.roomIdleMs);
    }
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
        for (const s of this.studentSockets(p.id)) {
          this.send(s, { type: "kicked" });
          s.close(4001, "kicked");
        }
        await this.save();
        this.broadcastLobby();
        return;
      }
      case "close_room": {
        await this.destroy();
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
      this.broadcastLobby();
      return;
    }

    if (!att.playerId || !d.players[att.playerId]) return this.error(ws, "not_joined", "Сначала войди в комнату");
    return this.error(ws, "not_teacher", "Это может только учитель");
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
      if (a?.role === "teacher" || (a?.role === "student" && a.playerId)) this.sendRaw(s, msg);
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
    await this.ctx.storage.setAlarm(this.data.lastActivity + LIMITS.roomIdleMs);
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
