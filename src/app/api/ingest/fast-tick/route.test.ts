// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { defaultFastTickDeps } = vi.hoisted(() => ({ defaultFastTickDeps: vi.fn() }));
vi.mock("@/lib/pipeline/deps", () => ({ defaultFastTickDeps }));

import { POST } from "./route";

beforeEach(() => {
  process.env.CRON_SECRET = "segredo-de-teste";
  defaultFastTickDeps.mockReset();
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("POST /api/ingest/fast-tick", () => {
  it("sem CRON_SECRET no cabeçalho devolve 401 e não monta dependências", async () => {
    const res = await POST(new Request("http://x/api/ingest/fast-tick", { method: "POST" }));
    expect(res.status).toBe(401);
    expect(defaultFastTickDeps).not.toHaveBeenCalled();
  });

  it("segredo errado devolve 401 e não monta dependências", async () => {
    const res = await POST(
      new Request("http://x/api/ingest/fast-tick", {
        method: "POST",
        headers: { authorization: "Bearer errado" },
      }),
    );
    expect(res.status).toBe(401);
    expect(defaultFastTickDeps).not.toHaveBeenCalled();
  });

  it("com o segredo devolve o resultado do runFastTick", async () => {
    defaultFastTickDeps.mockReturnValue({
      queue: { pending: async () => 0, enqueue: async () => true },
      runs: {
        activeSources: async () => [],
        defaultFrequency: async () => 30,
      },
      peekRateLimit: async () => true,
      now: () => new Date("2026-09-27T14:10:00Z"),
      secret: "segredo-de-teste",
    });
    const res = await POST(
      new Request("http://x/api/ingest/fast-tick", {
        method: "POST",
        headers: { authorization: "Bearer segredo-de-teste" },
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "idle" });
  });
});
