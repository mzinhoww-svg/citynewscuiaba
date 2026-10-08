import { describe, expect, it, vi } from "vitest";
import { handleClientError, MAX_CLIENT_ERROR_BYTES, parseClientError } from "./index";

const post = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://x.test/api/client-error", { method: "POST", body, headers });

describe("parseClientError", () => {
  it("mantém só os campos conhecidos e corta o tamanho", () => {
    const r = parseClientError(
      JSON.stringify({ message: "m".repeat(999), stack: "s", path: "/", digest: "d", extra: "x" }),
    );
    expect(r).toEqual({ message: "m".repeat(300), stack: "s", path: "/", digest: "d" });
  });

  it("recusa o que não é objeto JSON", () => {
    expect(parseClientError("não é json")).toBeNull();
    expect(parseClientError("42")).toBeNull();
    expect(parseClientError("null")).toBeNull();
  });
});

describe("handleClientError", () => {
  it("registra no log e responde 204", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handleClientError(
      post(JSON.stringify({ message: "boom", path: "/" }), { "user-agent": "iPhone" }),
    );
    expect(res.status).toBe(204);
    expect(log).toHaveBeenCalledWith(
      "client-error: boom",
      expect.objectContaining({ ua: "iPhone" }),
    );
    log.mockRestore();
  });

  it("400 para corpo inválido e 413 para corpo grande, com rastro no log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect((await handleClientError(post("x"))).status).toBe(400);
    const big = JSON.stringify({ message: "a".repeat(MAX_CLIENT_ERROR_BYTES) });
    expect((await handleClientError(post(big))).status).toBe(413);
    expect(warn).toHaveBeenCalledWith("client-error: recusado 413", expect.any(Object));
    expect(warn).toHaveBeenCalledWith("client-error: recusado 400", expect.any(Object));
    warn.mockRestore();
  });

  it("aceita pilha longa (dezenas de KB menos que o limite) e corta no log", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const res = await handleClientError(
      post(JSON.stringify({ message: "boom", stack: "s".repeat(20_000) }), {
        "x-forwarded-for": "198.51.100.7",
      }),
    );
    expect(res.status).toBe(204);
    const logged = log.mock.calls[0]?.[1] as { stack: string };
    expect(logged.stack).toHaveLength(1500);
    log.mockRestore();
  });

  it("429 depois do limite por IP", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const headers = { "x-forwarded-for": "203.0.113.9" };
    const codes: number[] = [];
    for (let i = 0; i < 12; i++)
      codes.push((await handleClientError(post(JSON.stringify({ message: "e" }), headers))).status);
    expect(codes.slice(0, 10).every((c) => c === 204)).toBe(true);
    expect(codes[11]).toBe(429);
    log.mockRestore();
  });
});
