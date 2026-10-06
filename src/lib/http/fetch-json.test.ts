import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchJson } from "./fetch-json";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const isCount = (v: unknown): v is { count: number } =>
  typeof v === "object" && v !== null && typeof (v as { count?: unknown }).count === "number";

describe("fetchJson", () => {
  it("devolve o corpo validado pelo guard", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ count: 3 })),
    );
    const r = await fetchJson("/api/x", { guard: isCount });
    expect(r).toEqual({ ok: true, value: { count: 3 } });
  });

  it("pede sem cache e aceita JSON por padrão", async () => {
    const base = vi.fn<typeof fetch>(async () => Response.json({}));
    vi.stubGlobal("fetch", base);
    await fetchJson("/api/x");
    const init = base.mock.calls[0]?.[1];
    expect(init?.cache).toBe("no-store");
    expect(new Headers(init?.headers).get("accept")).toBe("application/json");
  });

  it("status de erro vira http", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("x", { status: 503 })),
    );
    expect(await fetchJson("/api/x")).toEqual({ ok: false, error: "http" });
  });

  it("corpo que não é JSON ou não passa no guard vira parse", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200 })),
    );
    expect(await fetchJson("/api/x")).toEqual({ ok: false, error: "parse" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ count: "três" })),
    );
    expect(await fetchJson("/api/x", { guard: isCount })).toEqual({ ok: false, error: "parse" });
  });

  it("servidor que não responde no prazo vira timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_i: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((_r, reject) =>
            init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)),
          ),
      ),
    );
    const p = fetchJson("/api/x", { timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5001);
    expect(await p).toEqual({ ok: false, error: "timeout" });
  });

  it("sem rede vira network", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect(await fetchJson("/api/x")).toEqual({ ok: false, error: "network" });
  });
});
