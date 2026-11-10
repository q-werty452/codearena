/**
 * Поддельное расширение для витрины (только dev): держит снимок сессии
 * и отвечает на команды учителя так же, как сервер. Позволяет проверить
 * экраны в браузере без VS Code и без сервера.
 */
import {
  EMPTY_SESSION,
  type ClientMessage,
  type HostToUi,
  type PlayerInfo,
  type SessionSnapshot,
  type TeamIndex,
  type UiToHost,
} from "@codearena/shared";

export type DevScenario = "teacher" | "student" | "join" | "ended";

const NAMES = [
  "Айбек Касымов", "Нурай Абдыкадырова", "Тимур Б.", "Эльдияр Т.", "Айгерим С.", "Данияр М.",
  "Бэтмен", "Алина К.", "Арсен Ж.", "Мээрим О.", "Бексултан А.", "Жанара Т.",
];
const TEAM_NAMES = ["Красные", "Синие", "Зелёные"];

function players(n: number): PlayerInfo[] {
  return NAMES.slice(0, n).map((name, i) => ({
    id: `p${i}`,
    name,
    team: i < 3 ? 0 : i < 6 ? 1 : null,
    connected: i !== 4,
  }));
}

export function scenario(s: DevScenario): SessionSnapshot {
  const lobby = {
    code: "482913",
    mode: "teams2" as const,
    teams: TEAM_NAMES.slice(0, 2).map((name, i) => ({ index: i as TeamIndex, name })),
    players: players(9),
  };
  switch (s) {
    case "teacher":
      return {
        ...EMPTY_SESSION,
        role: "teacher",
        status: "online",
        code: "482913",
        link: "vscode://q-werty452.codearena/join?code=482913",
        webLink: "https://codearena.example.workers.dev/j/482913",
        lobby,
      };
    case "student":
      return { ...EMPTY_SESSION, role: "student", status: "online", code: "482913", me: { playerId: "p0", name: "Айбек Касымов", team: 0 }, lobby };
    case "ended":
      return { ...EMPTY_SESSION, ended: "kicked" };
    case "join":
      return { ...EMPTY_SESSION, savedName: "Айбек Касымов" };
  }
}

export function installDevHost(initial: SessionSnapshot): void {
  let s = initial;
  const emit = (m: HostToUi) => setTimeout(() => window.postMessage(m, "*"), 0);
  const push = () => emit({ type: "session", session: s });
  const setLobby = (patch: Partial<NonNullable<SessionSnapshot["lobby"]>>) => {
    s = { ...s, lobby: { ...s.lobby!, ...patch } };
    // Обновляем «меня» по лобби, как это делает расширение.
    if (s.me) {
      const me = s.lobby!.players.find((p) => p.id === s.me!.playerId);
      if (me) s = { ...s, me: { ...s.me, team: me.team, name: me.name } };
    }
    push();
  };

  const onSend = (m: ClientMessage) => {
    const lobby = s.lobby;
    if (!lobby) return;
    switch (m.type) {
      case "set_teams": {
        const n = m.mode === "teams2" ? 2 : m.mode === "teams3" ? 3 : 0;
        setLobby({
          mode: m.mode,
          teams: TEAM_NAMES.slice(0, n).map((name, i) => ({ index: i as TeamIndex, name: lobby.teams[i]?.name ?? name })),
          players: lobby.players.map((p) => {
            const t = m.assignment[p.id];
            return { ...p, team: n === 0 || t === undefined || t === null || t >= n ? null : t };
          }),
        });
        break;
      }
      case "rename_team":
        setLobby({ teams: lobby.teams.map((t) => (t.index === m.team ? { ...t, name: m.name } : t)) });
        break;
      case "rename_player":
        setLobby({ players: lobby.players.map((p) => (p.id === m.playerId ? { ...p, name: m.name } : p)) });
        break;
      case "kick_player":
        setLobby({ players: lobby.players.filter((p) => p.id !== m.playerId) });
        emit({ type: "toast", text: "Игрок удалён из комнаты" });
        break;
    }
  };

  (window as { __caDevHost?: (m: UiToHost) => void }).__caDevHost = (m: UiToHost) => {
    switch (m.type) {
      case "ready":
        push();
        break;
      case "send":
        onSend(m.msg);
        break;
      case "copy":
        void navigator.clipboard?.writeText(m.text).catch(() => {});
        break;
      case "join":
        s = { ...s, busy: true, error: null };
        push();
        setTimeout(() => {
          s = m.code === "000000"
            ? { ...s, busy: false, error: { field: "code", message: "bad_code" } }
            : { ...scenario("student"), me: { playerId: "p0", name: m.name, team: 0 } };
          push();
        }, 600);
        break;
      case "leave":
        s = scenario("join");
        push();
        break;
      default:
        console.log("[dev host]", m);
    }
  };
}
