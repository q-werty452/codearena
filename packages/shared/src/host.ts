/**
 * Протокол между расширением (host) и его webview.
 * Соединение с сервером держит расширение, а webview получает готовый
 * снимок сессии и только рисует его. Так боковая панель и панель игры
 * всегда показывают одно и то же.
 */
import type { ClientMessage, ServerMessage, TeamInfo, PlayerInfo, TeamMode, TeamIndex } from "./protocol.ts";

export type Role = "none" | "student" | "teacher";
export type ConnStatus = "idle" | "connecting" | "online" | "reconnecting";

export interface LobbySnapshot {
  code: string;
  mode: TeamMode;
  teams: TeamInfo[];
  players: PlayerInfo[];
}

export interface SessionSnapshot {
  role: Role;
  status: ConnStatus;
  code: string | null;
  /** Ссылка-приглашение (для учителя). */
  link: string | null;
  /** Веб-ссылка, которую удобно кидать в мессенджер. */
  webLink: string | null;
  me: { playerId: string; name: string; team: TeamIndex | null } | null;
  lobby: LobbySnapshot | null;
  /** Последнее сохранённое имя ученика — поле уже заполнено. */
  savedName: string;
  error: { field: "code" | "name" | "general"; message: string } | null;
  /** Конечные состояния, показываются отдельным экраном. */
  ended: null | "kicked" | "room_closed";
  busy: boolean;
}

export const EMPTY_SESSION: SessionSnapshot = {
  role: "none",
  status: "idle",
  code: null,
  link: null,
  webLink: null,
  me: null,
  lobby: null,
  savedName: "",
  error: null,
  ended: null,
  busy: false,
};

/** webview → расширение */
export type UiToHost =
  | { type: "ready" }
  | { type: "join"; code: string; name: string }
  | { type: "create_room" }
  | { type: "leave" }
  | { type: "open_panel" }
  | { type: "copy"; text: string }
  /** Команды учителя серверу (расширение проверяет роль и схему). */
  | { type: "send"; msg: ClientMessage };

/** расширение → webview */
export type HostToUi =
  | { type: "session"; session: SessionSnapshot }
  | { type: "prefill"; code: string }
  | { type: "server"; msg: ServerMessage }
  | { type: "toast"; text: string };
