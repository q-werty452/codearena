/**
 * Страница /w/123456#t=<токен наблюдателя> — «смотреть с телефона».
 * Учителю с телефона нужно немного: кто пишет, кто написал, кто застрял, прогресс
 * по эталону (если задан) и код ученика — по нажатию на него. Крупно и без мелочей.
 * Только просмотр: из команд телефону доступна лишь просьба показать код (peek).
 * Всё в одном файле, без внешних скриптов. Токен во фрагменте (#) не попадает в логи.
 */
export function watchPage(code: string): Response {
  const pretty = `${code.slice(0, 3)} ${code.slice(3)}`;
  const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#111113" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#f6f6f7" media="(prefers-color-scheme: light)" />
<title>CodeArena · ${pretty}</title>
<style>
  :root { --bg:#f6f6f7; --fg:#18181b; --muted:#71717a; --card:#fff; --line:#e7e7ea; --track:#e9e9ec;
          --ok:#16a34a; --warn:#ea580c; --info:#2563eb; --accent:#7c3aed; --code:#fbfbfc; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#111113; --fg:#f0f0f2; --muted:#9a9aa3; --card:#1a1a1d; --line:#2a2a2f; --track:#2a2a2f;
            --ok:#22c55e; --warn:#fb923c; --info:#60a5fa; --accent:#a78bfa; --code:#151517; }
  }
  * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
  html, body { margin:0; background:var(--bg); color:var(--fg); }
  body { font:17px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-text-size-adjust:100%;
         padding: max(14px, env(safe-area-inset-top)) 16px max(28px, env(safe-area-inset-bottom)); }
  main { max-width:560px; margin:0 auto; }
  button { font:inherit; color:inherit; background:none; border:0; padding:0; cursor:pointer; }

  .top { display:flex; align-items:center; justify-content:space-between; color:var(--muted); font-size:15px; margin-bottom:18px; }
  .conn { display:flex; align-items:center; gap:7px; }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--ok); }
  .conn.off .dot { background:var(--warn); }

  .hero { margin-bottom:6px; }
  .hero .big { font:800 56px/1 system-ui, sans-serif; letter-spacing:-.02em; font-variant-numeric:tabular-nums; }
  .hero .big small { font-size:24px; font-weight:600; color:var(--muted); letter-spacing:0; }
  .hero .cap { color:var(--muted); font-size:17px; margin-top:4px; }
  .meter { height:10px; border-radius:5px; background:var(--track); overflow:hidden; margin:14px 0 12px; }
  .meter i { display:block; height:100%; background:var(--ok); border-radius:5px; transition:width .4s; }
  .alerts { display:flex; flex-wrap:wrap; gap:8px; margin-bottom:6px; }
  .alert { font-size:15px; font-weight:600; color:var(--warn); background:color-mix(in srgb, var(--warn) 13%, transparent);
           padding:7px 12px; border-radius:999px; }

  .game { background:var(--card); border:1px solid var(--line); border-radius:16px; padding:14px 16px; margin-bottom:18px; }
  .game .row1 { display:flex; align-items:baseline; justify-content:space-between; gap:10px; }
  .game b { font-size:19px; }
  .timer { font:700 28px/1 ui-monospace, Menlo, monospace; font-variant-numeric:tabular-nums; }
  .timer.low { color:var(--warn); }
  .game .sub { color:var(--muted); font-size:15px; margin-top:6px; }
  .game .lead { margin-top:10px; font-size:15px; display:flex; flex-direction:column; gap:4px; }
  .game .lead span { display:flex; justify-content:space-between; }
  .game .lead em { font-style:normal; font-weight:700; font-variant-numeric:tabular-nums; }

  .list { margin-top:18px; background:var(--card); border:1px solid var(--line); border-radius:16px; overflow:hidden; }
  .st { display:flex; align-items:center; gap:12px; width:100%; text-align:left; padding:16px; min-height:64px; border-bottom:1px solid var(--line); }
  .st:last-child { border-bottom:0; }
  .st:active { background:color-mix(in srgb, var(--fg) 6%, transparent); }
  .st .mark { width:12px; height:12px; border-radius:50%; flex:none; }
  .st .who { flex:1; min-width:0; }
  .st .name { font-size:18px; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .st .pbar { display:flex; align-items:center; gap:8px; margin-top:7px; }
  .st .pbar .meter { flex:1; height:6px; margin:0; }
  .st .pbar .meter i { background:var(--accent); }
  .st .pbar span { font-size:14px; color:var(--muted); font-variant-numeric:tabular-nums; min-width:38px; text-align:right; }
  .st .word { font-size:15px; font-weight:700; white-space:nowrap; }
  .st .go { color:var(--muted); font-size:22px; line-height:1; margin-left:2px; }
  .st.off .name { color:var(--muted); }
  .st.off .word { color:var(--muted); font-weight:500; }
  .c-done { color:var(--ok); } .b-done { background:var(--ok); }
  .c-writing { color:var(--info); } .b-writing { background:var(--info); }
  .c-lost { color:var(--warn); } .b-lost { background:var(--warn); }
  .b-off { background:var(--line); }

  .empty { color:var(--muted); text-align:center; padding:48px 12px; font-size:17px; }
  .empty b { display:block; color:var(--fg); font:800 40px/1.1 ui-monospace, Menlo, monospace; margin-top:10px; letter-spacing:.04em; }
  .note { color:var(--muted); text-align:center; font-size:14px; margin-top:16px; }

  .bar { position:sticky; top:0; z-index:2; display:flex; align-items:center; gap:10px; background:var(--bg);
         margin:calc(-1 * max(14px, env(safe-area-inset-top))) -16px 0; padding: max(14px, env(safe-area-inset-top)) 16px 12px; }
  .back { font-size:30px; line-height:1; width:44px; height:44px; display:flex; align-items:center; justify-content:center;
          border-radius:12px; background:var(--card); border:1px solid var(--line); flex:none; }
  .bar .who { flex:1; min-width:0; }
  .bar .name { font-size:19px; font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .bar .file { font-size:14px; color:var(--muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .tabs { display:flex; gap:6px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:4px; margin:4px 0 12px; }
  .tabs button { flex:1; padding:10px 6px; border-radius:9px; font-size:15px; font-weight:600; color:var(--muted); }
  .tabs button.on { background:color-mix(in srgb, var(--accent) 16%, transparent); color:var(--fg); }
  .verdict { font-size:16px; font-weight:700; margin:2px 2px 10px; }
  .code { background:var(--code); border:1px solid var(--line); border-radius:14px; padding:12px 0; overflow:hidden;
          font:14px/1.55 ui-monospace, "JetBrains Mono", Menlo, Consolas, monospace; counter-reset:ln; }
  .code div { white-space:pre-wrap; word-break:break-word; padding:0 14px 0 52px; position:relative; min-height:1.55em; }
  .code div::before { counter-increment:ln; content:counter(ln); position:absolute; left:0; width:38px; text-align:right;
                      color:var(--muted); opacity:.55; font-size:12px; }
  .wait { color:var(--muted); text-align:center; padding:40px 12px; }
  .code.tap div { cursor:pointer; }
  .code.tap div:active { background:color-mix(in srgb, var(--accent) 14%, transparent); }
  .code div.hinted { background:color-mix(in srgb, var(--warn) 14%, transparent); }
  .code .hint { white-space:normal; font:600 14px/1.35 system-ui, sans-serif; color:var(--warn); padding:2px 14px 8px 52px; cursor:default; }
  .code .hint::before { content:none; counter-increment:none; }
  .sheet-bg { position:fixed; inset:0; background:rgba(0,0,0,.45); z-index:10; display:flex; align-items:flex-end; }
  .sheet { width:100%; max-width:560px; margin:0 auto; background:var(--card); border-radius:20px 20px 0 0; border:1px solid var(--line);
           padding:18px 16px max(18px, env(safe-area-inset-bottom)); }
  .sheet b { font-size:19px; display:block; }
  .sheet .src { font:14px/1.5 ui-monospace, Menlo, monospace; color:var(--muted); background:var(--code); border:1px solid var(--line);
                border-radius:10px; padding:8px 10px; margin:10px 0; white-space:pre-wrap; word-break:break-word; max-height:4.5em; overflow:hidden; }
  .sheet textarea { width:100%; min-height:88px; font:17px/1.4 system-ui, sans-serif; color:var(--fg); background:var(--bg);
                    border:1px solid var(--line); border-radius:12px; padding:12px; resize:none; outline:none; }
  .sheet textarea:focus { border-color:var(--accent); }
  .sheet .btns { display:flex; gap:10px; margin-top:12px; }
  .sheet .btns button { flex:1; height:52px; border-radius:14px; font-size:17px; font-weight:700; }
  .sheet .cancel { background:var(--bg); border:1px solid var(--line); }
  .sheet .send { background:var(--accent); color:#fff; }
  .sheet .send:disabled { opacity:.45; }
  .toast { position:fixed; left:50%; bottom:max(24px, env(safe-area-inset-bottom)); transform:translateX(-50%); z-index:20;
           background:var(--fg); color:var(--bg); padding:12px 18px; border-radius:999px; font-size:16px; font-weight:600; white-space:nowrap; }

  .msg { text-align:center; padding:72px 16px; }
  .msg b { display:block; font-size:21px; margin-bottom:8px; }
  .msg p { color:var(--muted); margin:0; }
</style>
</head>
<body>
<main id="app"><div class="msg"><b>CodeArena</b><p>…</p></div></main>
<div id="sheet"></div>
<script>
(() => {
  const CODE = "${code}";
  const PRETTY = "${pretty}";
  const lang = (navigator.language || "ru").toLowerCase();
  const ru = lang.startsWith("ru") || lang.startsWith("ky");
  document.documentElement.lang = ru ? "ru" : "en";
  const T = ru ? {
    room: "Комната", off: "нет связи", of: "из", wrote: "написали",
    lost: (n) => n + " не " + (n === 1 ? "понял" : "поняли"), ask: (n) => n + " просят объяснить ещё раз",
    done: "написал", writing: "пишет", lostOne: "не понял", offline: "не в сети",
    nobody: "Пока никто не вошёл. Код комнаты:", answered: "ответили", task: "задание",
    over: "Игра окончена", games: { quiz: "Викторина", tug: "Канат", codewars: "Codewars", race: "Гонка", bug: "Найди баг" },
    now: "Сейчас", sent: "Отправил", passed: (p, t) => "Прошёл тесты: " + p + " из " + t, ok: "Решено верно", bad: "Пока неверно",
    waiting: "Загружаю код…", noFile: "Ученик ещё не открыл файл урока", studentOff: "Ученик не в сети — код сейчас не получить",
    live: "Нажмите на строку — оставить подсказку", tap: "Нажмите на ученика, чтобы увидеть его код",
    hintFor: (n) => "Подсказка · строка " + n, hintPh: "Например: тут не закрыт тег", cancel: "Отмена", send: "Отправить",
    sentOk: "Подсказка отправлена ✓", sentFail: "Не отправилось: ученик не в сети",
    closedT: "Комната закрыта", closedP: "Учитель закрыл комнату или она долго простояла без дела.",
    badT: "Ссылка не подходит", badP: "Откройте её заново из VS Code: панель учителя → «С телефона».",
  } : {
    room: "Room", off: "offline", of: "of", wrote: "finished",
    lost: (n) => n + " lost", ask: (n) => n + " asked to explain again",
    done: "done", writing: "writing", lostOne: "lost", offline: "offline",
    nobody: "Nobody joined yet. Room code:", answered: "answered", task: "task",
    over: "Game over", games: { quiz: "Quiz", tug: "Tug of war", codewars: "Codewars", race: "Race", bug: "Find the bug" },
    now: "Now", sent: "Submitted", passed: (p, t) => "Tests passed: " + p + " of " + t, ok: "Solved", bad: "Not solved yet",
    waiting: "Loading the code…", noFile: "The student hasn't opened the lesson file yet", studentOff: "The student is offline — no code right now",
    live: "Tap a line to leave a hint", tap: "Tap a student to see their code",
    hintFor: (n) => "Hint · line " + n, hintPh: "For example: this tag isn't closed", cancel: "Cancel", send: "Send",
    sentOk: "Hint sent ✓", sentFail: "Not sent: the student is offline",
    closedT: "Room closed", closedP: "The teacher closed the room or it was idle for too long.",
    badT: "This link doesn't work", badP: "Open it again from VS Code: teacher panel → «From phone».",
  };

  const token = new URLSearchParams(location.hash.slice(1)).get("t") || "";
  const app = document.getElementById("app");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const S = { live: false, ended: null, players: [], teams: [], statuses: {}, progress: {}, confused: 0,
              game: null, subs: {}, skew: 0, open: null, peek: null, tab: "now", hints: {} };

  const isDone = (id) => S.statuses[id] === "done" || (S.progress[id] || 0) >= 100;
  const statusOf = (id) => (isDone(id) ? "done" : S.statuses[id] === "lost" ? "lost" : "writing");
  const word = (st) => (st === "done" ? T.done : st === "lost" ? T.lostOne : T.writing);
  const player = (id) => S.players.find((p) => p.id === id);

  function secondsLeft() {
    const st = S.game && S.game.state;
    if (!st || S.game.over || st.deadline == null || st.phase === "paused" || st.phase === "over") return null;
    return Math.max(0, Math.ceil((st.deadline - (Date.now() + S.skew)) / 1000));
  }
  const fmt = (s) => (s === null ? "" : Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"));

  /* ── главный экран ── */
  function gameBlock() {
    const g = S.game;
    if (!g) return "";
    const st = g.state;
    const kind = (st && st.game) || g.kind;
    let h = '<section class="game"><div class="row1"><b>' + esc(T.games[kind] || kind) + "</b>";
    if (g.over) h += '<span class="sub">' + T.over + "</span></div>";
    else {
      const left = secondsLeft();
      h += '<span class="timer' + (left !== null && left <= 10 ? " low" : "") + '" id="timer">' + fmt(left) + "</span></div>";
      if (st) h += '<div class="sub">' + T.task + " " + Math.min(st.taskIndex + 1, st.taskCount) + " " + T.of + " " + st.taskCount +
        (st.total ? " · " + T.answered + " " + st.answered + " " + T.of + " " + st.total : "") + "</div>";
    }
    // Лидеры — только когда уже есть очки (в начале игры одни нули — лишний шум).
    const leaders = ((g.over ? g.over.leaders : st && st.leaders) || []).filter((r) => r.score > 0).slice(0, 3);
    if (leaders.length) h += '<div class="lead">' + leaders.map((r, i) => "<span>" + (i + 1) + ". " + esc(r.name) + "<em>" + r.score + "</em></span>").join("") + "</div>";
    return h + "</section>";
  }

  function mainView() {
    const ps = S.players;
    let h = '<div class="top"><span>' + T.room + " " + PRETTY + '</span><span class="conn' + (S.live ? "" : " off") + '"><span class="dot"></span>' + (S.live ? "" : T.off) + "</span></div>";
    h += gameBlock();
    if (!ps.length) return h + '<div class="empty">' + T.nobody + "<b>" + PRETTY + "</b></div>";
    const done = ps.filter((p) => statusOf(p.id) === "done").length;
    const lost = ps.filter((p) => statusOf(p.id) === "lost").length;
    h += '<div class="hero"><div class="big">' + done + " <small>" + T.of + " " + ps.length + '</small></div><div class="cap">' + T.wrote + "</div></div>";
    h += '<div class="meter"><i style="width:' + Math.round((100 * done) / ps.length) + '%"></i></div>';
    const alerts = [];
    if (lost) alerts.push(T.lost(lost));
    if (S.confused > 0) alerts.push(T.ask(S.confused));
    if (alerts.length) h += '<div class="alerts">' + alerts.map((a) => '<span class="alert">' + esc(a) + "</span>").join("") + "</div>";
    const order = { lost: 0, writing: 1, done: 2 };
    const sorted = ps.slice().sort((a, b) => (b.connected - a.connected) || (order[statusOf(a.id)] - order[statusOf(b.id)]) || a.name.localeCompare(b.name));
    h += '<div class="list">' + sorted.map((p) => {
      const st = statusOf(p.id);
      const pr = S.progress[p.id];
      const showBar = pr !== undefined && st !== "done";
      return '<button class="st' + (p.connected ? "" : " off") + '" data-id="' + esc(p.id) + '">' +
        '<span class="mark ' + (p.connected ? "b-" + st : "b-off") + '"></span>' +
        '<span class="who"><div class="name">' + esc(p.name) + "</div>" +
        (showBar ? '<div class="pbar"><span class="meter"><i style="width:' + Math.max(0, Math.min(100, pr)) + '%"></i></span><span>' + pr + "%</span></div>" : "") +
        "</span>" +
        '<span class="word ' + (p.connected ? "c-" + st : "") + '">' + (p.connected ? word(st) : T.offline) + '</span><span class="go">›</span></button>';
    }).join("") + "</div>";
    return h + '<p class="note">' + T.tap + "</p>";
  }

  /* ── код ученика ── */
  /** Код по строкам. tap — можно нажать на строку и оставить подсказку; hints — уже отправленные. */
  function codeLines(text, tap, hints) {
    hints = hints || {};
    return '<div class="code' + (tap ? " tap" : "") + '">' + String(text).replace(/\\n$/, "").split("\\n").map((l, i) => {
      const n = i + 1;
      const h = hints[n];
      return '<div data-n="' + n + '"' + (h ? ' class="hinted"' : "") + ">" + (esc(l) || " ") + "</div>" + (h ? '<div class="hint">💬 ' + esc(h) + "</div>" : "");
    }).join("") + "</div>";
  }

  function codeView() {
    const p = player(S.open) || { name: "?", connected: false };
    const st = statusOf(S.open);
    const sub = S.subs[S.open];
    const pk = S.peek;
    let h = '<div class="bar"><button class="back" id="back" aria-label="back">‹</button><div class="who"><div class="name">' + esc(p.name) + '</div><div class="file">' +
      (S.tab === "now" && pk && pk.fileName ? esc(pk.fileName) + " · " : "") + '<span class="c-' + st + '">' + word(st) + "</span></div></div></div>";
    if (sub) h += '<div class="tabs"><button data-tab="now"' + (S.tab === "now" ? ' class="on"' : "") + ">" + T.now + '</button><button data-tab="sent"' + (S.tab === "sent" ? ' class="on"' : "") + ">" + T.sent + (sub.correct ? " ✓" : "") + "</button></div>";
    if (sub && S.tab === "sent") {
      const verdict = sub.report && sub.report.total ? T.passed(sub.report.passed, sub.report.total) : sub.correct ? T.ok : T.bad;
      return h + '<div class="verdict ' + (sub.correct ? "c-done" : "c-lost") + '">' + esc(verdict) + "</div>" + codeLines(sub.code || "");
    }
    if (!pk) return h + '<div class="wait">' + T.waiting + "</div>";
    if (pk.err) return h + '<div class="wait">' + T.studentOff + "</div>";
    if (!pk.text) return h + '<div class="wait">' + T.noFile + "</div>";
    return h + codeLines(pk.text, true, S.hints[S.open]) + '<p class="note">' + T.live + "</p>";
  }

  function message(title, text) {
    app.innerHTML = '<div class="msg"><b>' + esc(title) + "</b><p>" + esc(text) + "</p></div>";
  }

  function render() {
    if (S.ended === "closed") return message(T.closedT, T.closedP);
    if (S.ended === "bad") return message(T.badT, T.badP);
    const y = window.scrollY;
    app.innerHTML = S.open ? codeView() : mainView();
    window.scrollTo(0, y);
  }

  /* ── открыть / закрыть код ── */
  let peekTimer = null;
  function askCode() {
    if (S.open && ws && ws.readyState === 1 && document.visibilityState === "visible") ws.send(JSON.stringify({ type: "peek", playerId: S.open }));
  }
  function openCode(id) {
    S.open = id; S.peek = null; S.tab = "now";
    history.pushState({ code: id }, "");
    window.scrollTo(0, 0);
    render();
    askCode();
    clearInterval(peekTimer);
    peekTimer = setInterval(askCode, 5000);
  }
  function closeCode() {
    S.open = null; S.peek = null;
    clearInterval(peekTimer);
    render();
  }
  app.addEventListener("click", (e) => {
    const row = e.target.closest(".st");
    if (row) return openCode(row.dataset.id);
    if (e.target.closest("#back")) return history.back();
    const tab = e.target.closest("[data-tab]");
    if (tab) { S.tab = tab.dataset.tab; render(); return; }
    const ln = e.target.closest(".code.tap [data-n]");
    if (ln) openSheet(Number(ln.dataset.n), ln.textContent);
  });

  /* ── подсказка на строке: лист снизу ── */
  const sheet = document.getElementById("sheet");
  function openSheet(n, src) {
    const id = S.open;
    const prev = (S.hints[id] || {})[n] || "";
    sheet.innerHTML = '<div class="sheet-bg"><div class="sheet"><b>' + esc(T.hintFor(n)) + '</b><div class="src">' + esc(src) + "</div>" +
      '<textarea maxlength="300" placeholder="' + esc(T.hintPh) + '">' + esc(prev) + "</textarea>" +
      '<div class="btns"><button class="cancel">' + T.cancel + '</button><button class="send"' + (prev ? "" : " disabled") + ">" + T.send + "</button></div></div></div>";
    const ta = sheet.querySelector("textarea");
    const sendBtn = sheet.querySelector(".send");
    ta.addEventListener("input", () => { sendBtn.disabled = !ta.value.trim(); });
    sheet.querySelector(".cancel").onclick = closeSheet;
    sheet.querySelector(".sheet-bg").onclick = (e) => { if (e.target.classList.contains("sheet-bg")) closeSheet(); };
    sendBtn.onclick = () => {
      const text = ta.value.trim();
      if (!text || !ws || ws.readyState !== 1) return;
      const fileName = (S.peek && S.peek.fileName) || undefined;
      ws.send(JSON.stringify({ type: "hint", playerId: id, line: n, text: text, fileName: fileName }));
      S.pendingHint = { playerId: id, line: n };
      closeSheet();
    };
    setTimeout(() => ta.focus(), 50);
  }
  function closeSheet() { sheet.innerHTML = ""; }
  let toastTimer = null;
  function toast(text) {
    let el = document.querySelector(".toast");
    if (!el) { el = document.createElement("div"); el.className = "toast"; document.body.appendChild(el); }
    el.textContent = text;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 2200);
  }
  window.addEventListener("popstate", () => { if (S.open) closeCode(); });

  /* ── сервер ── */
  function onMessage(m) {
    switch (m.type) {
      case "lobby": S.players = m.players; S.teams = m.teams; break;
      case "lesson_state": S.statuses = m.statuses; S.progress = m.progress || {}; S.confused = m.confused; break;
      case "game_started": S.game = { kind: m.game, state: null, over: null }; S.subs = {}; break;
      case "state":
        if (!S.game) S.game = { kind: m.state.game, state: null, over: null };
        S.game.state = m.state; S.skew = m.state.serverNow - Date.now(); break;
      case "game_over": if (!S.game) S.game = { kind: "quiz", state: null, over: null }; S.game.over = { leaders: m.leaders }; break;
      case "game_reset": S.game = null; S.subs = {}; break;
      case "teacher_feed":
        if (m.event.kind !== "submission" || typeof m.event.code !== "string") return;
        S.subs[m.event.playerId] = { code: m.event.code, correct: m.event.correct, report: m.event.report };
        if (S.open !== m.event.playerId) return;
        break;
      case "peek_code":
        if (m.playerId !== S.open) return;
        if (S.peek && !S.peek.err && S.peek.text === m.text && S.peek.fileName === m.fileName) return; // не перерисовывать зря
        S.peek = { text: m.text, fileName: m.fileName };
        break;
      case "hint_sent":
        (S.hints[m.playerId] = S.hints[m.playerId] || {})[m.line] = m.text;
        S.pendingHint = null;
        toast(T.sentOk);
        if (S.open !== m.playerId) return;
        break;
      case "error":
        if (m.code !== "not_joined" || !S.open) return;
        if (S.pendingHint) { S.pendingHint = null; toast(T.sentFail); return; }
        S.peek = { err: true };
        break;
      case "room_closed": S.ended = "closed"; break;
      default: return;
    }
    render();
  }

  let ws = null, tries = 0, opened = false;
  async function connect() {
    if (S.ended || (ws && ws.readyState <= 1)) return;
    try {
      const r = await fetch("/rooms/" + CODE, { cache: "no-store" });
      if (r.ok && !(await r.json()).exists) { S.ended = "closed"; return render(); }
    } catch {}
    ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/rooms/" + CODE + "/ws?watch=" + encodeURIComponent(token));
    ws.onopen = () => { opened = true; tries = 0; S.live = true; render(); askCode(); };
    ws.onmessage = (e) => { try { onMessage(JSON.parse(e.data)); } catch {} };
    ws.onclose = () => {
      S.live = false;
      // Три раза подряд не подключились — ссылка не та.
      if (!opened && ++tries >= 3) { S.ended = "bad"; return render(); }
      opened = false;
      if (!S.ended) { render(); setTimeout(connect, Math.min(10000, 1000 * 2 ** Math.min(tries, 3))); }
    };
  }

  if (!/^[0-9a-f]{32}$/.test(token)) { S.ended = "bad"; render(); return; }
  render();
  connect();
  setInterval(() => { if (ws && ws.readyState === 1) ws.send('{"type":"ping"}'); }, 25000);
  setInterval(() => {
    const el = document.getElementById("timer");
    if (!el) return;
    const left = secondsLeft();
    el.textContent = fmt(left);
    el.classList.toggle("low", left !== null && left <= 10);
  }, 1000);
  // Экран телефона не гаснет, пока страница открыта (если браузер умеет).
  const wake = () => { try { navigator.wakeLock && navigator.wakeLock.request("screen").catch(() => {}); } catch {} };
  wake();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    wake();
    if (!S.live && !S.ended) connect();
    askCode();
  });
})();
</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
    },
  });
}
