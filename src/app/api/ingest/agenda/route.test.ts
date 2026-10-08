// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

afterEach(() => vi.unstubAllEnvs());

describe("POST /api/ingest/agenda", () => {
  it("recusa sem o segredo do cron", async () => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    const res = await POST(new Request("http://x/api/ingest/agenda", { method: "POST" }));
    expect(res.status).toBe(401);
    const bad = await POST(
      new Request("http://x/api/ingest/agenda", {
        method: "POST",
        headers: { authorization: "Bearer errado" },
      }),
    );
    expect(bad.status).toBe(401);
  });
  it("recusa tudo quando o segredo não está configurado", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const res = await POST(
      new Request("http://x/api/ingest/agenda", {
        method: "POST",
        headers: { authorization: "Bearer " },
      }),
    );
    expect(res.status).toBe(401);
  });
});

const h = vi.hoisted(() => ({
  loadEventSources: vi.fn(),
  loadStartedAt: 0,
  collectAgenda: vi.fn(),
  store: {
    lastRunStartedAt: vi.fn(async () => null),
    cachePurge: vi.fn(async () => {}),
    aiLimits: vi.fn(async () => ({ perRun: 40, perDay: 160 })),
    aiPagesToday: vi.fn(async () => 150),
    cacheGet: vi.fn(async () => null),
    cachePut: vi.fn(async () => {}),
    startRun: vi.fn(async () => "run-1"),
    finishRun: vi.fn(async () => {}),
    existing: vi.fn(async () => []),
    save: vi.fn(async () => 0),
    stored: vi.fn(async () => []),
    sourceState: vi.fn(async () => {}),
  },
}));

vi.mock("@/lib/db/client", () => ({ createServiceClient: () => ({}) }));
vi.mock("@/lib/db/pipeline-store", () => ({
  createIngestRepo: () => ({ hitRateLimit: async () => true }),
}));
vi.mock("@/lib/db/agenda-store", () => ({ createAgendaStore: () => h.store }));
vi.mock("@/lib/db/agenda-sources", () => ({ loadEventSources: h.loadEventSources }));
vi.mock("@/lib/ai/server", () => ({ createProductionAi: () => ({ callAgent: vi.fn() }) }));
vi.mock("@/lib/agenda/collect", () => ({
  collectAgenda: h.collectAgenda,
  AI_HARD_DEADLINE_MS: 55_000,
}));

const DB_SOURCE = {
  id: "casa-banco",
  uuid: "f2000000-0000-4000-8000-000000000001",
  name: "Casa do banco (fictícia)",
  kind: "ai_page",
  url: "https://casa-banco.example/",
  origin: "organizer",
  enabled: true,
  confirms: true,
  notes: [],
  listUrls: [],
};

const call = (q = "?force=1") =>
  POST(
    new Request(`http://x/api/ingest/agenda${q}`, {
      method: "POST",
      headers: { authorization: "Bearer segredo-de-teste" },
    }),
  );

describe("POST /api/ingest/agenda · fontes e orçamento", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "segredo-de-teste");
    h.loadEventSources.mockReset().mockImplementation(async () => {
      h.loadStartedAt = performance.now();
      return [DB_SOURCE];
    });
    h.collectAgenda.mockReset().mockResolvedValue({ sources: [], aiPages: 0 });
    for (const fn of Object.values(h.store)) fn.mockClear();
  });

  it("lê as fontes do banco (loadEventSources) e passa o que sobra do teto do dia", async () => {
    vi.stubEnv("CRAWLER_FIXTURES", "");
    const res = await call();
    expect(res.status).toBe(200);
    expect(h.loadEventSources).toHaveBeenCalledTimes(1);
    const deps = h.collectAgenda.mock.calls[0]?.[0];
    expect(deps.sources).toEqual([DB_SOURCE]);
    expect(deps.aiBudget).toEqual({ perRun: 40, remainingToday: 10 });
    expect(deps.signal).toBeInstanceOf(AbortSignal);
    // O prazo conta do início do pedido (antes de ler fontes e banco).
    expect(deps.startedAt).toBeLessThanOrEqual(deps.monotonic());
    expect(deps.startedAt).toBeLessThan(h.loadStartedAt);
    expect(typeof deps.monotonic()).toBe("number");
    expect(h.store.cachePurge).toHaveBeenCalledTimes(1);
    expect(h.store.finishRun).toHaveBeenCalledWith("run-1", { sources: [], aiPages: 0 });
  });

  it("modo de fixtures usa as fontes fictícias e não lê o banco", async () => {
    vi.stubEnv("CRAWLER_FIXTURES", "1");
    await call();
    expect(h.loadEventSources).not.toHaveBeenCalled();
    const deps = h.collectAgenda.mock.calls[0]?.[0];
    expect(deps.sources.map((s: { id: string }) => s.id)).toContain("teatro-cerrado");
  });

  it("ensaio não expurga nem grava cache e não abre execução", async () => {
    vi.stubEnv("CRAWLER_FIXTURES", "");
    await call("?dry=1");
    expect(h.store.cachePurge).not.toHaveBeenCalled();
    expect(h.store.startRun).not.toHaveBeenCalled();
    const deps = h.collectAgenda.mock.calls[0]?.[0];
    expect(deps.dryRun).toBe(true);
    await deps.cache.put("u", "h", { ok: true });
    expect(h.store.cachePut).not.toHaveBeenCalled();
  });
});
