import { createMemoryQueue } from "@/lib/pipeline/testing/memory-queue";
import { createMemoryRunStore } from "@/lib/pipeline/testing/memory-run-store";

const SECRET = "segredo-de-teste-da-rota-fast-tick-32+";
const { defaultFastTickDeps } = vi.hoisted(() => ({ defaultFastTickDeps: vi.fn() }));
vi.mock("@/lib/pipeline/deps", () => ({ defaultFastTickDeps }));

const req = (secret?: string) =>
  new Request("http://localhost/api/ingest/fast-tick", {
    method: "POST",
    headers: secret ? { authorization: `Bearer ${secret}` } : {},
  });

beforeEach(() => {
  vi.stubEnv("CRON_SECRET", SECRET);
  defaultFastTickDeps.mockReset();
  defaultFastTickDeps.mockImplementation(() => ({
    queue: createMemoryQueue(),
    runs: createMemoryRunStore({ sources: [{ slug: "rapida", frequencyMinutes: 10 }] }),
    peekRateLimit: async () => true,
    now: () => new Date("2026-09-27T14:10:00Z"),
    secret: process.env.CRON_SECRET,
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/fast-tick", () => {
  it("configuração da rota igual à do tick normal", async () => {
    const route = await import("./route");
    expect(route.runtime).toBe("nodejs");
    expect(route.dynamic).toBe("force-dynamic");
    expect(route.maxDuration).toBe(60);
  });

  it("sem CRON_SECRET devolve 401 e não monta dependências", async () => {
    const { POST } = await import("./route");
    expect((await POST(req())).status).toBe(401);
    expect((await POST(req("errado"))).status).toBe(401);
    expect(defaultFastTickDeps).not.toHaveBeenCalled();
  });

  it("com o segredo devolve o resultado do runFastTick", async () => {
    const { POST } = await import("./route");
    const res = await POST(req(SECRET));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      status: "started",
      windowStart: "2026-09-27T14:10:00.000Z",
      enqueued: 1,
    });
    expect(defaultFastTickDeps).toHaveBeenCalledTimes(1);
  });
});
