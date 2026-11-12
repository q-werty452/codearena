// Наводит мышь на значок CodeArena в строке состояния настоящего VS Code (CDP),
// ждёт всплывающее окошко, снимает его и (по желанию) нажимает кнопку-ссылку в нём.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function hoverBar(port, { click = null, shot = null, openSidebar = false } = {}) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const page = targets.find((t) => t.type === "page" && /workbench/.test(t.url));
  if (!page) return { ok: false, results: ["no workbench page"] };
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((r) => ws.on("open", r));
  let id = 0;
  const pending = new Map();
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.id && pending.has(m.id)) (pending.get(m.id)(m), pending.delete(m.id));
  });
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => (await send("Runtime.evaluate", { expression: expr, returnByValue: true })).result?.result?.value;
  const mouse = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
  const results = [];
  try {
    // Значок: элемент строки состояния, в id которого есть codearena.lesson.
    const item = await ev(`(() => { const e = [...document.querySelectorAll('.statusbar-item')].find((x) => (x.id || '').includes('codearena.lesson'));
      if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, right: e.closest('.right-items') !== null, text: e.innerText, w: innerWidth }; })()`);
    if (!item) return { ok: false, results: ["status bar item codearena.lesson not found"] };
    results.push(`status bar item "${item.text.trim()}" on the ${item.right ? "right" : "LEFT"} side`);
    await mouse("mouseMoved", item.x - 30, item.y - 200);
    await sleep(200);
    await mouse("mouseMoved", item.x, item.y);
    let hover = null;
    for (let i = 0; i < 40 && !hover; i++) {
      await sleep(150);
      hover = await ev(`(() => { const h = [...document.querySelectorAll('.monaco-hover')].find((x) => x.offsetParent !== null && x.innerText.includes('CodeArena'));
        if (!h) return null; const r = h.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height, text: h.innerText, links: [...h.querySelectorAll('a')].map((a) => a.getAttribute('data-href') || a.getAttribute('href') || '') }; })()`);
    }
    if (!hover) return { ok: false, results: [...results, "hover popup did not appear"] };
    results.push(`popup ${Math.round(hover.w)}×${Math.round(hover.h)} above the item: ${hover.y + hover.h <= item.y + 2}`);
    results.push("popup text: " + hover.text.replace(/\s+/g, " ").trim());
    results.push("popup links: " + hover.links.map((l) => l.replace(/^command:/, "")).join(", "));
    if (shot) {
      const pad = 12;
      const r = await send("Page.captureScreenshot", { format: "png", clip: { x: Math.max(0, hover.x - pad), y: Math.max(0, hover.y - pad), width: hover.w + pad * 2, height: item.y - hover.y + 20 + pad, scale: 1 } });
      writeFileSync(shot, Buffer.from(r.result.data, "base64"));
      results.push("screenshot: " + shot);
    }
    if (click) {
      // Ведём мышь внутрь окошка (оно не должно закрыться) и жмём ссылку.
      const a = await ev(`(() => { const h = [...document.querySelectorAll('.monaco-hover')].find((x) => x.offsetParent !== null && x.innerText.includes('CodeArena'));
        const a = h && [...h.querySelectorAll('a')].find((x) => (x.getAttribute('data-href') || x.getAttribute('href') || '').includes(${JSON.stringify(click)}));
        if (!a) return null; const r = a.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, text: a.innerText }; })()`);
      if (!a) return { ok: false, results: [...results, "link " + click + " not found"] };
      await mouse("mouseMoved", item.x, (item.y + a.y) / 2);
      await sleep(100);
      await mouse("mouseMoved", a.x, a.y);
      await sleep(300);
      await mouse("mousePressed", a.x, a.y);
      await mouse("mouseReleased", a.x, a.y);
      results.push(`clicked "${a.text.trim()}" in the popup`);
    }
    if (openSidebar) {
      // Клик по самой иконке — открывается боковая панель CodeArena.
      await mouse("mouseMoved", item.x, item.y - 300);
      await sleep(500);
      await mouse("mousePressed", item.x, item.y);
      await mouse("mouseReleased", item.x, item.y);
      let side = null;
      for (let i = 0; i < 30 && !side; i++) {
        await sleep(200);
        side = await ev(`(() => { const p = document.querySelector('.part.sidebar'); return p && p.offsetWidth > 0 && /codearena/i.test(p.querySelector('.composite.title')?.innerText || '') ? p.offsetWidth : null; })()`);
      }
      results.push("click on the icon opened the CodeArena sidebar: " + !!side);
      if (!side) return { ok: false, results };
    }
    return { ok: item.right && item.text.trim() === "", results };
  } finally {
    ws.close();
  }
}
