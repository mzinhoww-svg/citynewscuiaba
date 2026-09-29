// @vitest-environment node
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { pinnedHttp, pinnedLookup, safeGet } from "./net";

/*
 * M4a (gate P5): o IP validado é o IP conectado. O resolvedor falso responde com endereço público
 * na checagem (`urlProblem`) e com loopback na conexão (rebinding); o servidor local nunca pode
 * receber o pedido.
 */
let server: Server;
let port = 0;
let hits = 0;
beforeAll(async () => {
  server = createServer((_req, res) => {
    hits++;
    res.end("interno");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("DNS pinning", () => {
  it("resolvedor que alterna (público, depois loopback) nunca conecta no loopback", async () => {
    let calls = 0;
    const resolve = async () => (calls++ === 0 ? ["93.184.215.14"] : ["127.0.0.1"]);
    const r = await safeGet(
      { http: pinnedHttp(resolve), resolve },
      `http://rebind.example:${port}/`,
      { headers: {}, signal: AbortSignal.timeout(3000), maxBytes: 1024 },
    );
    expect(hits).toBe(0);
    expect(r.kind).toBe("network_error");
  });

  it("o lookup de conexão recusa endereço proibido e devolve só os validados", async () => {
    const lookup = pinnedLookup(async () => ["10.0.0.1", "93.184.215.14"]);
    const bad = await new Promise<Error | null>((res) =>
      lookup("x.example", {}, (e) => res(e as Error | null)),
    );
    expect(bad?.message).toMatch(/não permitido/);
    const good = pinnedLookup(async () => ["93.184.215.14"]);
    const out = await new Promise<unknown>((res) =>
      good("x.example", { all: true }, (_e, a) => res(a)),
    );
    expect(out).toEqual([{ address: "93.184.215.14", family: 4 }]);
  });
});
