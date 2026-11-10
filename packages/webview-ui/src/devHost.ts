/**
 * Поддельное расширение для витрины (только dev): держит снимок сессии
 * и отвечает на команды учителя так же, как сервер. Позволяет проверить
 * экраны в браузере без VS Code и без сервера.
 */
import * as engine from "../../server/src/engine.ts";
import {
  EMPTY_SESSION,
  GameSettings,
  applyGameMessage,
  type Task,
  type ClientMessage,
  type HostToUi,
  type PlayerInfo,
  type SessionSnapshot,
  type TeamIndex,
  type UiToHost,
} from "@codearena/shared";

export type DevScenario = "teacher" | "student" | "join" | "ended" | "quiz" | "tug";

const NAMES = [
  "Айбек Касымов", "Нурай Абдыкадырова", "Тимур Б.", "Эльдияр Т.", "Айгерим С.", "Данияр М.",
  "Бэтмен", "Алина К.", "Арсен Ж.", "Мээрим О.", "Бексултан А.", "Жанара Т.",
];
const TEAM_NAMES = ["Красные", "Синие", "Зелёные"];
type TaskList = Task[];

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
    case "quiz":
    case "tug":
      return { ...EMPTY_SESSION, role: "student", status: "online", code: "482913", me: { playerId: "p0", name: "Айбек Касымов", team: 0 }, lobby };
    case "ended":
      return { ...EMPTY_SESSION, ended: "kicked" };
    case "join":
      return { ...EMPTY_SESSION, savedName: "Айбек Касымов" };
  }
}

let stopGame: (() => void) | null = null;

export function installDevHost(initial: SessionSnapshot, opts: { autoQuiz?: TaskList; autoTug?: TaskList } = {}): void {
  stopGame?.();
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

  /* ── Игра на настоящем движке сервера, боты отвечают сами ── */
  let game: engine.GameData | null = null;
  const clock = { offset: 0 };
  const me = s.me?.playerId ?? null;
  const env = (): engine.EngineEnv => ({
    now: Date.now(),
    players: s.lobby!.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
    online: new Set(s.lobby!.players.filter((p) => p.connected).map((p) => p.id)),
    mode: s.lobby!.mode,
  });
  const deliver = (fx: engine.Effect[]) => {
    for (const { to, msg } of fx) {
      const mine =
        to === "all" ||
        (s.role === "teacher" ? to === "teacher" : to === "students" || (typeof to === "object" && to.player === me));
      if (!mine) continue;
      const next = applyGameMessage(s.game, msg, clock);
      if (next !== undefined) s = { ...s, game: next };
      if (msg.type === "task") scheduleBots(msg.taskId);
    }
    push();
  };
  const timers: ReturnType<typeof setTimeout>[] = [];
  const scheduleBots = (taskId: string) => {
    for (const p of s.lobby!.players) {
      if (p.id === me || !p.connected) continue;
      const tug = game?.game === "tug";
      timers.push(
        setTimeout(() => {
          const task = game?.tasks[game.index];
          if (!game || !task || game.taskKey !== taskId) return;
          let answer: string | number;
          if (task.type === "choice") answer = Math.random() < 0.7 ? task.correct : Math.floor(Math.random() * task.options.length);
          else if (task.type === "short_answer") answer = Math.random() < 0.6 ? task.answers[0]! : "0";
          else return;
          try {
            deliver(engine.submit(game, env(), p.id, taskId, answer));
          } catch {
            /* опоздал, заблокирован или уже показали ответ */
          }
        }, tug ? 2500 + Math.random() * 9000 : 1500 + Math.random() * 11000),
      );
    }
  };
  const tick = setInterval(() => {
    if (game?.deadline && Date.now() >= game.deadline) deliver(engine.onDeadline(game, env()));
  }, 200);
  stopGame = () => {
    clearInterval(tick);
    timers.forEach(clearTimeout);
  };
  const startGame = (kind: "quiz" | "tug", tasks: TaskList, settings = GameSettings.parse({})) => {
    try {
      game = engine.startGame(kind, tasks, settings, Date.now(), s.lobby!.mode);
    } catch (e) {
      emit({ type: "toast", text: (e as Error).message });
      return;
    }
    deliver(engine.startEffects(game, env()));
  };
  if (opts.autoQuiz) setTimeout(() => startGame("quiz", opts.autoQuiz!), 300);
  if (opts.autoTug) setTimeout(() => startGame("tug", opts.autoTug!), 300);

  const onSend = (m: ClientMessage) => {
    const lobby = s.lobby;
    if (!lobby) return;
    if (game) {
      const e = env();
      if (m.type === "next") return deliver(engine.next(game, e));
      if (m.type === "pause") return deliver(engine.pause(game, e));
      if (m.type === "resume") return deliver(engine.resume(game, e));
      if (m.type === "end_game") return deliver(engine.finish(game, e));
      if (m.type === "reset_game") {
        game = null;
        s = { ...s, game: null };
        return push();
      }
    }
    if (m.type === "start_game") return startGame(m.game === "tug" ? "tug" : "quiz", m.tasks, m.settings);
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
      case "answer":
        if (game && me) {
          try {
            deliver(engine.submit(game, env(), me, m.taskId, m.answer));
          } catch (e) {
            console.warn(e);
          }
        }
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
