import * as vscode from "vscode";
import WebSocket from "ws";
import {
  ClientMessage,
  CreateRoomResponse,
  EMPTY_SESSION,
  applyGameMessage,
  parseServerMessage,
  type GameSnapshot,
  type HostToUi,
  type ServerMessage,
  type SessionSnapshot,
} from "@codearena/shared";

/** Что сохраняется между перезапусками VS Code: вернуться в ту же комнату. */
interface Saved {
  role: "student" | "teacher";
  code: string;
  token: string;
  name?: string;
  at: number;
}

const SAVED_KEY = "codearena.session";
const NAME_KEY = "codearena.name";
/** Через сколько сохранённая сессия считается устаревшей (комната живёт 6 ч без активности). */
const SAVED_TTL = 6 * 60 * 60 * 1000;

type Listener = (msg: HostToUi) => void;

/**
 * Сессия: одно соединение с комнатой. Переподключается сама,
 * сохраняет токен, раздаёт снимок состояния всем webview.
 */
export class Session implements vscode.Disposable {
  private state: SessionSnapshot;
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private pendingName: string | null = null;
  private retry = 0;
  private retryTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private listeners = new Set<Listener>();
  private disposed = false;
  /** Разница «часы сервера − мои часы», мс (обновляется сообщением state). */
  private clock = { offset: 0 };
  /** Вызывается, когда началась игра (расширение открывает панель игры). */
  onGameStarted: (() => void) | null = null;

  constructor(private readonly ctx: vscode.ExtensionContext) {
    this.state = { ...EMPTY_SESSION, savedName: ctx.globalState.get<string>(NAME_KEY, "") };
  }

  get snapshot(): SessionSnapshot {
    return this.state;
  }

  get serverUrl(): string {
    const url = vscode.workspace.getConfiguration("codearena").get<string>("serverUrl", "").trim();
    return url.replace(/\/+$/, "");
  }

  onMessage(fn: Listener): vscode.Disposable {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }

  /** Восстановить прошлую сессию (VS Code перезапустился посреди урока). */
  async restore(): Promise<void> {
    const saved = this.ctx.globalState.get<Saved>(SAVED_KEY);
    if (!saved || Date.now() - saved.at > SAVED_TTL || this.state.role !== "none") return;
    if (!(await this.roomExists(saved.code).catch(() => false))) {
      await this.ctx.globalState.update(SAVED_KEY, undefined);
      return;
    }
    this.token = saved.token;
    this.pendingName = saved.name ?? this.state.savedName;
    this.set({ role: saved.role, code: saved.code, status: "connecting", ...this.links(saved.code, saved.role) });
    this.connect();
  }

  /* ─────────────── Ученик ─────────────── */

  async join(code: string, name: string): Promise<void> {
    this.closeSocket();
    this.set({ ...EMPTY_SESSION, savedName: name, busy: true });
    await this.ctx.globalState.update(NAME_KEY, name);

    let exists: boolean;
    try {
      exists = await this.roomExists(code);
    } catch {
      return this.set({ busy: false, error: { field: "general", message: "server_unreachable" } });
    }
    if (!exists) return this.set({ busy: false, error: { field: "code", message: "bad_code" } });

    // Тот же код, что в прошлый раз — пробуем вернуться со своим токеном.
    const saved = this.ctx.globalState.get<Saved>(SAVED_KEY);
    this.token = saved?.role === "student" && saved.code === code ? saved.token : null;
    this.pendingName = name;
    this.set({ role: "student", code, status: "connecting" });
    this.connect();
  }

  /* ─────────────── Учитель ─────────────── */

  async createRoom(): Promise<void> {
    this.closeSocket();
    this.set({ ...EMPTY_SESSION, savedName: this.state.savedName, busy: true });
    try {
      const r = await fetch(`${this.serverUrl}/rooms`, { method: "POST" });
      if (!r.ok) throw new Error(String(r.status));
      const { code, teacherToken } = CreateRoomResponse.parse(await r.json());
      this.token = teacherToken;
      await this.save({ role: "teacher", code, token: teacherToken, at: Date.now() });
      this.set({ role: "teacher", code, status: "connecting", busy: false, ...this.links(code, "teacher") });
      this.connect();
    } catch {
      this.set({ busy: false, error: { field: "general", message: "server_unreachable" } });
    }
  }

  /** Отправить сообщение серверу (команды учителя, ответы ученика). */
  send(msg: ClientMessage): boolean {
    const ok = ClientMessage.safeParse(msg);
    if (!ok.success || !this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(ok.data));
    return true;
  }

  /** Ответ ученика на текущее задание. */
  answer(taskId: string, answer: number | string): void {
    const g = this.state.game;
    if (!g || g.phase !== "playing" || g.task?.id !== taskId || g.myAnswer !== null) return;
    this.send({ type: "submit", taskId, answer });
  }

  /** Локальные изменения игры (например, результат прогона тестов у ученика). */
  patchGame(patch: Partial<GameSnapshot>): void {
    if (!this.state.game) return;
    this.set({ game: { ...this.state.game, ...patch } });
  }

  /** Выйти из комнаты (учитель при этом закрывает комнату). */
  async leave(): Promise<void> {
    if (this.state.role === "teacher") this.send({ type: "close_room" });
    await this.ctx.globalState.update(SAVED_KEY, undefined);
    this.closeSocket();
    this.token = null;
    this.set({ ...EMPTY_SESSION, savedName: this.state.savedName });
  }

  /* ─────────────── Соединение ─────────────── */

  private connect(): void {
    if (this.disposed || !this.state.code) return;
    const base = this.serverUrl.replace(/^http/, "ws");
    const q = this.state.role === "teacher" && this.token ? `?teacher=${encodeURIComponent(this.token)}` : "";
    const ws = new WebSocket(`${base}/rooms/${this.state.code}/ws${q}`);
    this.ws = ws;

    ws.on("open", () => {
      if (ws !== this.ws) return;
      this.retry = 0;
      if (this.state.role === "student") {
        ws.send(JSON.stringify({ type: "join", name: this.pendingName ?? this.state.savedName, token: this.token ?? undefined }));
      } else {
        this.set({ status: "online" });
      }
      this.startPing();
    });

    ws.on("message", (data) => {
      if (ws !== this.ws) return;
      const msg = parseServerMessage(data.toString());
      if (msg) void this.onServer(msg);
    });

    ws.on("unexpected-response", (_req, res) => {
      // 404 — комнаты больше нет, 403 — не тот токен учителя.
      if (res.statusCode === 404 || res.statusCode === 403) void this.end("room_closed");
    });

    ws.on("close", (code) => {
      if (ws !== this.ws) return;
      this.stopPing();
      if (code === 4001) return void this.end("kicked");
      if (code === 4004) return void this.end("room_closed");
      if (code === 4002) return; // открыли в другом окне VS Code
      this.scheduleReconnect();
    });

    ws.on("error", () => {
      /* обработает close */
    });
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.state.role === "none" || this.state.ended) return;
    this.set({ status: "reconnecting" });
    // 0.5, 1, 2, 4, 8, потом каждые 10 секунд.
    const delay = Math.min(10_000, 500 * 2 ** this.retry++);
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private startPing(): void {
    this.stopPing();
    // Сервер отвечает на ping без пробуждения комнаты — бесплатно.
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) this.ws.send('{"type":"ping"}');
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private async onServer(msg: ServerMessage): Promise<void> {
    switch (msg.type) {
      case "joined": {
        this.token = msg.token;
        const name = this.pendingName ?? this.state.savedName;
        await this.save({ role: "student", code: this.state.code!, token: msg.token, name, at: Date.now() });
        this.set({ status: "online", busy: false, error: null, me: { playerId: msg.playerId, name, team: msg.team } });
        break;
      }
      case "lobby": {
        const lobby = { code: msg.code, mode: msg.mode, teams: msg.teams, players: msg.players };
        const meInfo = this.state.me && msg.players.find((p) => p.id === this.state.me!.playerId);
        this.set({
          lobby,
          me: meInfo ? { playerId: meInfo.id, name: meInfo.name, team: meInfo.team } : this.state.me,
        });
        // Учитель переподключился — продлеваем сохранённую сессию.
        if (this.state.role === "teacher") await this.touchSaved();
        break;
      }
      case "error": {
        if (msg.code === "name_taken" && this.state.role === "student" && !this.state.me) {
          this.closeSocket();
          this.set({ role: "none", status: "idle", busy: false, error: { field: "name", message: "name_taken" } });
        } else {
          this.emit({ type: "toast", text: msg.message });
        }
        break;
      }
      case "game_started":
      case "task":
      case "answered":
      case "reveal":
      case "result":
      case "state":
      case "game_over":
      case "game_reset": {
        const wasIdle = !this.state.game || this.state.game.phase === "over";
        const next = applyGameMessage(this.state.game, msg, this.clock);
        if (next !== undefined) this.set({ game: next });
        if (msg.type === "game_started" && wasIdle) this.onGameStarted?.();
        break;
      }
      case "kicked":
        await this.end("kicked");
        break;
      case "room_closed":
        await this.end("room_closed");
        break;
      default:
        break;
    }
    this.emit({ type: "server", msg });
  }

  private async end(reason: "kicked" | "room_closed"): Promise<void> {
    await this.ctx.globalState.update(SAVED_KEY, undefined);
    this.closeSocket();
    this.token = null;
    this.set({ ...EMPTY_SESSION, savedName: this.state.savedName, ended: reason, code: this.state.code });
  }

  /* ─────────────── Утилиты ─────────────── */

  private async roomExists(code: string): Promise<boolean> {
    const r = await fetch(`${this.serverUrl}/rooms/${code}`, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(String(r.status));
    const body = (await r.json()) as { exists?: boolean };
    return body.exists === true;
  }

  private links(code: string, role: "student" | "teacher"): Pick<SessionSnapshot, "link" | "webLink"> {
    if (role !== "teacher") return { link: null, webLink: null };
    const id = `${this.ctx.extension.packageJSON.publisher}.${this.ctx.extension.packageJSON.name}`;
    return {
      link: `${vscode.env.uriScheme}://${id}/join?code=${code}`,
      webLink: `${this.serverUrl}/j/${code}`,
    };
  }

  private async save(s: Saved): Promise<void> {
    await this.ctx.globalState.update(SAVED_KEY, s);
  }

  private async touchSaved(): Promise<void> {
    const s = this.ctx.globalState.get<Saved>(SAVED_KEY);
    if (s) await this.save({ ...s, at: Date.now() });
  }

  private closeSocket(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.stopPing();
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
  }

  private set(patch: Partial<SessionSnapshot>): void {
    this.state = { ...this.state, ...patch };
    this.emit({ type: "session", session: this.state });
  }

  private emit(msg: HostToUi): void {
    for (const l of this.listeners) l(msg);
  }

  dispose(): void {
    this.disposed = true;
    this.closeSocket();
    this.listeners.clear();
  }
}

