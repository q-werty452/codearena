/**
 * Поддельное расширение для витрины (только dev): держит снимок сессии
 * и отвечает на команды учителя так же, как сервер. Позволяет проверить
 * экраны в браузере без VS Code и без сервера.
 */
import * as engine from "../../server/src/engine.ts";
import {
  EMPTY_LESSON,
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
  type AiState,
  type MySet,
  distribute,
  parseTasksText,
} from "@codearena/shared";
import { bankFor } from "./lib/bank.ts";

export type DevScenario = "teacher" | "student" | "join" | "ended" | "quiz" | "tug" | "codewars" | "bug" | "race";

// Витрина на английском (?lang=en) — английские имена, для скриншотов Marketplace.
const EN = typeof location !== "undefined" && new URLSearchParams(location.search).get("lang") === "en";
const NAMES = EN
  ? ["Alex Morgan", "Sofia Petrova", "Tim B.", "Emma T.", "Aisha S.", "Daniel M.", "Batman", "Alina K.", "Arsen Z.", "Maya O.", "Ben A.", "Jane T."]
  : [
      "Айбек Касымов", "Нурай Абдыкадырова", "Тимур Б.", "Эльдияр Т.", "Айгерим С.", "Данияр М.",
      "Бэтмен", "Алина К.", "Арсен Ж.", "Мээрим О.", "Бексултан А.", "Жанара Т.",
    ];
const TEAM_NAMES = EN ? ["Red", "Blue", "Green"] : ["Красные", "Синие", "Зелёные"];
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
        // Урок: у учеников разные статусы, двое анонимно просят объяснить.
        lesson: {
          ...EMPTY_LESSON,
          checkpoint: 2,
          confused: 2,
          statuses: { p0: "done", p1: "writing", p2: "lost", p3: "writing", p5: "writing", p6: "writing", p7: "lost", p8: "done" },
          progress: { p1: 40, p2: 15, p3: 100, p4: 0, p5: 85, p6: 60, p7: 30 },
          share: { fileName: "index.html", line: 12, version: 41 },
        },
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
    case "codewars":
    case "bug":
    case "race":
      return {
        ...EMPTY_SESSION,
        role: "student",
        status: "online",
        code: "482913",
        me: { playerId: "p0", name: NAMES[0]!, team: 0 },
        lobby,
        lesson: { ...EMPTY_LESSON, checkpoint: 2, share: { fileName: "index.html", line: 12, version: 41 }, refFile: "index.html", myFile: "site/index.html", myProgress: 64 },
      };
    case "ended":
      return { ...EMPTY_SESSION, ended: "kicked" };
    case "join":
      return { ...EMPTY_SESSION, savedName: NAMES[0]! };
  }
}

let stopGame: (() => void) | null = null;

export function installDevHost(initial: SessionSnapshot, opts: { autoQuiz?: TaskList; autoTug?: TaskList; autoCode?: TaskList; autoBug?: TaskList; autoRace?: TaskList } = {}): void {
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
          if (task.type === "fix_bug") {
            const n = task.rules.length + task.tests.length;
            const good = Math.random() < 0.7;
            const report = good ? { passed: n, total: n, failures: [] } : { passed: 0, total: n, failures: [] };
            try {
              deliver(engine.submit(game, env(), p.id, taskId, undefined, { code: task.solution ?? "fixed", report }));
            } catch {
              /* уже исправил */
            }
            return;
          }
          if (task.type === "find_line") {
            const lines = task.code.split("\n").length;
            try {
              deliver(engine.submit(game, env(), p.id, taskId, Math.random() < 0.6 ? task.line : 1 + Math.floor(Math.random() * lines)));
            } catch {
              /* уже ответил */
            }
            return;
          }
          if (task.type === "code") {
            // Боты присылают решения разной длины; часть — с ошибкой.
            const good = Math.random() < 0.65;
            const variants = [
              "def evens(nums):\n    return [n for n in nums if n % 2 == 0]",
              "def evens(nums):\n    result = []\n    for n in nums:\n        if n % 2 == 0:\n            result.append(n)\n    return result",
              "evens = lambda n: [x for x in n if x % 2 < 1]",
              "def evens(nums):\n    return list(filter(lambda n: n % 2 == 0, nums))",
            ];
            const code = good ? variants[Math.floor(Math.random() * variants.length)]! : "def evens(nums):\n    return nums";
            const total = task.tests.length;
            const report = good ? { passed: total, total, failures: [] } : { passed: 0, total, failures: [{ name: task.tests[0]!.call, expected: task.tests[0]!.expected, got: "[1, 2, 3, 4]" }] };
            try {
              deliver(engine.submit(game, env(), p.id, taskId, undefined, { code, report }));
            } catch {
              /* уже решил или время вышло */
            }
            return;
          }
          let answer: string | number;
          if (task.type === "choice") answer = Math.random() < 0.7 ? task.correct : Math.floor(Math.random() * task.options.length);
          else if (task.type === "best_variant") answer = Math.random() < 0.7 ? task.correct : Math.floor(Math.random() * task.variants.length);
          else if (task.type === "short_answer") answer = Math.random() < 0.6 ? task.answers[0]! : "0";
          else return;
          try {
            deliver(engine.submit(game, env(), p.id, taskId, answer));
          } catch {
            /* опоздал, заблокирован или уже показали ответ */
          }
        }, tug ? 2500 + Math.random() * 9000 : game?.game === "codewars" ? 4000 + Math.random() * 20000 : 1500 + Math.random() * 11000),
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
  /** Гонка: каждый бот бежит в своём темпе, иногда ошибается. */
  const raceBot = (pid: string) => {
    timers.push(
      setTimeout(() => {
        const g = game;
        if (!g || g.game !== "race" || g.phase === "over") return;
        if (g.phase !== "playing" || g.race!.finishedAt[pid] !== undefined) return g.phase === "paused" ? raceBot(pid) : undefined;
        const pos = g.race!.pos[pid] ?? 0;
        const task = g.tasks[pos % g.tasks.length]!;
        const ok = Math.random() < 0.75;
        const answer = task.type === "choice" ? (ok ? task.correct : (task.correct + 1) % task.options.length) : task.type === "short_answer" ? (ok ? task.answers[0] : "?") : undefined;
        const n = task.type === "code" ? task.tests.length + task.rules.length : 0;
        try {
          deliver(engine.submit(g, env(), pid, `r${pos}`, answer, task.type === "code" ? { code: task.solution ?? "x", report: { passed: ok ? n : 0, total: n, failures: [] } } : {}));
        } catch {
          /* заблокирован — попробует позже */
        }
        raceBot(pid);
      }, 2500 + Math.random() * 6000),
    );
  };

  const startGame = (kind: "quiz" | "tug" | "codewars" | "bug" | "race", tasks: TaskList, settings = GameSettings.parse({})) => {
    try {
      game = engine.startGame(kind, tasks, settings, Date.now(), s.lobby!.mode);
    } catch (e) {
      emit({ type: "toast", text: (e as Error).message });
      return;
    }
    deliver(engine.startEffects(game, env()));
    if (kind === "race") for (const p of s.lobby!.players) if (p.id !== me && p.connected) raceBot(p.id);
    // Пара ботов «списывает» — чтобы были видны флаги у учителя.
    const cheat = (ms: number, pid: string, kind: "paste" | "big_insert" | "focus_lost" | "ai_extension", detail: string) =>
      timers.push(setTimeout(() => game && game.phase !== "over" && deliver(engine.flag(game, pid, kind, detail)), ms));
    cheat(3000, "p6", "ai_extension", "GitHub Copilot, Codeium (Windsurf)");
    cheat(5000, "p6", "paste", "120");
    cheat(7000, "p2", "focus_lost", "14.2");
    cheat(9000, "p2", "focus_lost", "6");
    cheat(11000, "p6", "big_insert", "312");
  };
  if (opts.autoQuiz) setTimeout(() => startGame("quiz", opts.autoQuiz!), 300);
  if (opts.autoTug) setTimeout(() => startGame("tug", opts.autoTug!), 300);
  if (opts.autoCode) setTimeout(() => startGame("codewars", opts.autoCode!), 300);
  if (opts.autoBug) setTimeout(() => startGame("bug", opts.autoBug!), 300);
  if (opts.autoRace) setTimeout(() => startGame("race", opts.autoRace!, GameSettings.parse({ raceLength: 8, roundSec: 300 })), 300);

  // Codewars у «меня»: в браузере нет запускалки — первый прогон падает, второй проходит.
  let runs = 0;
  const fakeRun = (submit: boolean) => {
    const task = game?.tasks[game.index];
    if (!game || !task || (task.type !== "code" && task.type !== "fix_bug") || !s.game) return;
    const taskId = game.taskKey;
    s = { ...s, game: { ...s.game, localRun: { taskId, running: true, results: [], error: null, submitted: submit } } };
    push();
    setTimeout(() => {
      const pass = runs++ > 0;
      const checks = [...task.tests.map((t) => ({ call: t.call, expected: t.expected })), ...task.rules.map((r) => ({ call: r.label, expected: "" }))];
      const results = checks.map((t, i) => ({ call: t.call, expected: t.expected, ok: pass || i > 0, got: pass || i > 0 ? undefined : "не найдено" }));
      s = { ...s, game: { ...s.game!, localRun: { taskId, running: false, results, error: null, submitted: submit } } };
      push();
      if (submit && me) {
        const passed = results.filter((r) => r.ok).length;
        const report = { passed, total: results.length, failures: results.filter((r) => !r.ok).map((r) => ({ name: r.call, expected: r.expected, got: r.got })) };
        try {
          deliver(engine.submit(game!, env(), me, taskId, undefined, { code: "def evens(nums):\n    return [n for n in nums if not n % 2]", report }));
        } catch (e) {
          console.warn(e);
        }
      }
    }, 700);
  };

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
    if (m.type === "checkpoint_set") {
      s = { ...s, lesson: { ...s.lesson, checkpoint: s.lesson.checkpoint + 1, statuses: {}, confused: 0, myStatus: "writing", iConfused: false } };
      return push();
    }
    if (m.type === "start_game") return startGame(m.game, m.tasks, m.settings);
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

  // «Мои задания» и ИИ — имитация расширения.
  let mySets: MySet[] = [];
  let ai: AiState = { hasKey: true, busy: false };
  let aiTimers: ReturnType<typeof setTimeout>[] = [];
  const pushMy = () => {
    emit({ type: "my_tasks", sets: mySets });
    emit({ type: "ai_state", state: ai });
  };
  const setAi = (p: Partial<AiState>) => {
    ai = { ...ai, ...p };
    emit({ type: "ai_state", state: ai });
  };
  const addSet = (title: string, source: MySet["source"], tasks: Task[], fileName?: string) => {
    const set: MySet = { id: String(Date.now()), title, source, fileName, createdAt: Date.now(), tasks };
    mySets = [set, ...mySets];
    emit({ type: "my_tasks", sets: mySets });
    return set;
  };
  const DEMO_FILE = `# Тема: Теги HTML\n\n1. Какой тег создаёт ссылку?\n- <div>\n+ <a>\n- <span>\n\n2. Тег абзаца?\na) <br>\nb) <p>\nОтвет: b\n\n3. Атрибут адреса ссылки?\n= href\n\n4. Какой тег для списка?\n- <ol>\n- <ul>\n\n5. Свойство цвета текста?\n= color`;

  (window as { __caDevHost?: (m: UiToHost) => void }).__caDevHost = (m: UiToHost) => {
    switch (m.type) {
      case "ready":
        push();
        pushMy();
        break;
      case "import_tasks": {
        if (new URLSearchParams(location.search).has("unrecognized")) {
          emit({ type: "import_result", result: { source: "file", title: "", fileName: "конспект.docx", byGame: {}, skipped: [], unrecognized: true } });
          break;
        }
        const r = parseTasksText(DEMO_FILE);
        const code = bankFor("codewars").find((b) => b.id.startsWith("javascript"))!.set.tasks.slice(0, 2);
        const tasks = [...r.tasks, ...code];
        const set = addSet(r.title, "file", tasks, "контрольная.docx");
        emit({ type: "import_result", result: { source: "file", title: r.title, fileName: "контрольная.docx", byGame: distribute(tasks), skipped: r.skipped, setId: set.id } });
        break;
      }
      case "my_tasks_add":
        addSet(m.title, "paste", m.tasks);
        break;
      case "my_tasks_delete":
        mySets = mySets.filter((x) => x.id !== m.id);
        emit({ type: "my_tasks", sets: mySets });
        break;
      case "ai_set_key":
        setAi({ hasKey: true });
        break;
      case "ai_clear_key":
        setAi({ hasKey: false });
        break;
      case "ai_cancel":
        aiTimers.forEach(clearTimeout);
        setAi({ busy: false, stage: undefined, error: "cancelled" });
        break;
      case "ai_generate": {
        const req = m.req;
        const game = req.mode === "extract" ? "quiz" : req.game;
        const pool = (game === "race" ? [...bankFor("quiz"), ...bankFor("tug"), ...bankFor("codewars")] : bankFor(game)).flatMap((b) => b.set.tasks);
        const tasks = pool.sort(() => Math.random() - 0.5).slice(0, req.count);
        const codeN = tasks.filter((t) => t.type === "code" || t.type === "fix_bug").length;
        setAi({ busy: true, stage: "model", error: undefined, model: "gemini-3.6-flash" });
        const at = (ms: number, f: () => void) => aiTimers.push(setTimeout(f, ms));
        at(400, () => setAi({ stage: "generate" }));
        let t = 2200;
        if (codeN) {
          at(t, () => setAi({ stage: "verify", done: 0, total: codeN }));
          for (let i = 1; i <= codeN; i++) at((t += 350), () => setAi({ done: i }));
        }
        at(t + 300, () => {
          const title = req.topic || "Задания от ИИ";
          const set = addSet(title, "ai", tasks);
          emit({ type: "import_result", result: { source: "ai", title, byGame: req.mode === "extract" ? distribute(tasks) : distribute(tasks, game === "race" ? "race" : undefined), skipped: codeN ? [{ where: "Сумма чётных", reason: "solution_fails", detail: "sum([1, 2]) → got 3, expected 2" }] : [], setId: set.id } });
          setAi({ busy: false, stage: undefined });
        });
        break;
      }
      case "send":
        onSend(m.msg);
        break;
      case "export_csv":
        console.log("[dev host] export_csv", m.fileName, "\n" + m.content);
        break;
      case "toggle_follow":
        s = { ...s, lesson: { ...s.lesson, follow: !s.lesson.follow } };
        push();
        break;
      case "share_stop":
        s = { ...s, lesson: { ...s.lesson, share: null } };
        push();
        break;
      case "share_file":
        s = { ...s, lesson: { ...s.lesson, share: { fileName: "index.html", line: 0, version: 1 } } };
        push();
        break;
      case "checkpoint":
        s = { ...s, lesson: { ...s.lesson, checkpoint: s.lesson.checkpoint + 1, statuses: {}, confused: 0, progress: {} } };
        push();
        break;
      case "lesson_status":
        s = { ...s, lesson: { ...s.lesson, myStatus: m.status } };
        push();
        break;
      case "lesson_confused":
        s = { ...s, lesson: { ...s.lesson, iConfused: true } };
        push();
        break;
      case "run_tests":
        fakeRun(false);
        break;
      case "submit_code":
        fakeRun(true);
        break;
      case "check_code":
        // Имитация: «сломанный» код (без footer/flex и т.п.) не проходит, исправленный проходит.
        setTimeout(() => {
          const looksFixed = m.code.length > 0 && !/class="footer"|float|<br>/.test(m.code);
          const checks = [...m.tests.map((t) => ({ call: t.call, expected: t.expected })), ...m.rules.map((r) => ({ call: r.label, expected: "" }))];
          emit({ type: "check_result", requestId: m.requestId, results: checks.map((c) => ({ ...c, ok: looksFixed })), error: null });
        }, 400);
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
