import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { classify, fetchJson, NetError } from "./net.ts";

/** Локальный «плохой интернет»: страница сети, сбой 503, 429, молчание. */
let server: Server;
let base = "";
let hits503 = 0;
beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === "/portal") return void res.writeHead(200, { "content-type": "text/html" }).end("<html><body>Войдите в Wi-Fi колледжа</body></html>");
    if (req.url === "/flaky") {
      hits503++;
      if (hits503 === 1) return void res.writeHead(503).end("busy");
      return void res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
    }
    if (req.url === "/limit") return void res.writeHead(429, { "content-type": "application/json" }).end('{"error":"too_many"}');
    if (req.url === "/silent") return; // не отвечаем никогда
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => {
  server.closeAllConnections();
  server.close();
});

describe("сеть на слабом Wi-Fi", () => {
  it("обычный ответ", async () => {
    expect(await fetchJson(`${base}/ok`)).toEqual({ status: 200, body: { ok: true } });
  });
  it("сбой 503 — повтор, со второй попытки получилось", async () => {
    const r = await fetchJson(`${base}/flaky`, {}, [2000, 2000]);
    expect(r.body).toEqual({ ok: true });
    expect(hits503).toBe(2);
  });
  it("429 отдаётся сразу, без повторов", async () => {
    expect((await fetchJson(`${base}/limit`, {}, [2000, 2000])).status).toBe(429);
  });
  it("страница сети вместо сервера — «portal», без повторов", async () => {
    await expect(fetchJson(`${base}/portal`)).rejects.toMatchObject({ problem: "portal" });
  });
  it("сервер молчит — «timeout» после всех попыток", async () => {
    const t0 = Date.now();
    await expect(fetchJson(`${base}/silent`, {}, [300, 300])).rejects.toMatchObject({ problem: "timeout" });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(600);
  });
  it("закрытый порт — «reset»", async () => {
    await expect(fetchJson("http://127.0.0.1:1/x", {}, [1000])).rejects.toMatchObject({ problem: "reset" });
  });
  it("несуществующий адрес — «dns» (или «offline», если DNS вообще недоступен)", async () => {
    const e = await fetchJson("http://codearena-no-such-host.invalid/x", {}, [3000]).catch((x: NetError) => x);
    expect(["dns", "offline"]).toContain((e as NetError).problem);
  });
  it("подмена сертификата — «tls»", () => {
    const e = Object.assign(new TypeError("fetch failed"), { cause: { code: "SELF_SIGNED_CERT_IN_CHAIN", message: "self-signed certificate in certificate chain" } });
    expect(classify(e).problem).toBe("tls");
  });
});
