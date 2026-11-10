import type { CreateRoomResponse } from "@codearena/shared";
import { joinPage } from "./joinPage.ts";
export { Room } from "./room.ts";

export interface Env {
  ROOMS: DurableObjectNamespace<import("./room.ts").Room>;
  /** Лимиты по IP (в тестах и локально могут отсутствовать). */
  CREATE_LIMITER?: RateLimit;
  JOIN_LIMITER?: RateLimit;
}

/** true — лимит превышен. Ключ — IP клиента. */
async function limited(limiter: RateLimit | undefined, request: Request): Promise<boolean> {
  if (!limiter) return false;
  const ip = request.headers.get("cf-connecting-ip") ?? "local";
  const { success } = await limiter.limit({ key: ip });
  return !success;
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...CORS },
  });
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 900_000;
  return String(100_000 + n);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/" || url.pathname === "/health") {
      return json({ ok: true, name: "codearena", repo: "https://github.com/q-werty452/codearena" });
    }

    // Страница-приглашение для мессенджеров.
    const jp = url.pathname.match(/^\/j\/(\d{6})$/);
    if (jp && request.method === "GET") return joinPage(jp[1]!);

    // Создать комнату: вернуть 6-значный код и токен учителя.
    if (url.pathname === "/rooms" && request.method === "POST") {
      if (await limited(env.CREATE_LIMITER, request)) return json({ error: "too_many_rooms" }, 429);
      for (let attempt = 0; attempt < 12; attempt++) {
        const code = randomCode();
        const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
        const teacherToken = crypto.randomUUID();
        const ok = await stub.init(code, teacherToken);
        if (ok) return json({ code, teacherToken } satisfies CreateRoomResponse, 201);
      }
      return json({ error: "no_free_code" }, 503);
    }

    // Апгрейд до WebSocket: /rooms/123456/ws[?teacher=<token>]
    const m = url.pathname.match(/^\/rooms\/(\d{6})\/ws$/);
    if (m) {
      if (await limited(env.JOIN_LIMITER, request)) return json({ error: "too_many_requests" }, 429);
      if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
        return json({ error: "expected_websocket" }, 426);
      }
      const stub = env.ROOMS.get(env.ROOMS.idFromName(m[1]!));
      return stub.fetch(request);
    }

    // Проверить, существует ли комната (для поля ввода кода).
    const exists = url.pathname.match(/^\/rooms\/(\d{6})$/);
    if (exists && request.method === "GET") {
      if (await limited(env.JOIN_LIMITER, request)) return json({ error: "too_many_requests" }, 429);
      const stub = env.ROOMS.get(env.ROOMS.idFromName(exists[1]!));
      return json({ exists: await stub.exists() });
    }

    return json({ error: "not_found" }, 404);
  },
} satisfies ExportedHandler<Env>;
