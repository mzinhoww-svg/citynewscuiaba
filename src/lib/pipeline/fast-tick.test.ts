import { vi } from "vitest";
import { handleFastTick, runFastTick } from "./fast-tick";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore, type DueSourceInput } from "./testing/memory-run-store";

const at = (iso: string) => () => new Date(iso);
const src = (slug: string, o: Omit<DueSourceInput, "slug"> = {}): DueSourceInput => ({
  slug,
  ...o,
});
const allow = async () => true;

describe("tick rápido (via rápida, spec §7.8)", () => {
  it("cria um run fast por janela de 10 min e enfileira só fontes rápidas vencidas", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore({
      sources: [
        src("rapida", { frequencyMinutes: 10, lastFetchedAt: "2026-09-27T14:03:00Z" }),
        src("normal", { frequencyMinutes: null }),
      ],
    });
    const now = at("2026-09-27T14:10:02Z");
    const r = await runFastTick({ queue, runs, peekRateLimit: allow, now });
    expect(r).toMatchObject({
      status: "started",
      windowStart: "2026-09-27T14:10:00.000Z",
      enqueued: 1,
      skipped: [],
    });
    expect(runs.created[0]!.trigger).toBe("fast");
    expect(queue.messages().map((m) => [m.step, m.itemRef])).toEqual([["fetch", "source:rapida"]]);
    expect(await runFastTick({ queue, runs, peekRateLimit: allow, now })).toMatchObject({
      status: "existing",
      enqueued: 0,
    });
    expect(queue.messages()).toHaveLength(1);
    expect(runs.count()).toBe(1);
    expect(runs.created[0]!.stats).toMatchObject({ fetch_enqueued: 1, skipped: [] });
  });

  it("sem fonte rápida ativa responde idle sem criar run", async () => {
    const runs = createMemoryRunStore({
      sources: [
        src("normal"),
        src("pausada", { frequencyMinutes: 10, status: "paused" }),
        src("lenta", { frequencyMinutes: 10, crawlDelaySec: 900 }),
      ],
    });
    const r = await runFastTick({
      queue: createMemoryQueue(),
      runs,
      peekRateLimit: allow,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(r).toEqual({ status: "idle" });
    expect(runs.created).toHaveLength(0);
  });

  it("pula rate_limited sem consumir cota, previous_pending e fast_lane_full", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", {
      runId: "cron-run",
      step: "fetch",
      itemRef: "source:c",
      attempt: 1,
    });
    const runs = createMemoryRunStore({
      fastLaneMax: 1,
      sources: [
        src("a", { frequencyMinutes: 10, priority: 1, rateLimitPerHour: 6 }),
        src("b", { frequencyMinutes: 10, priority: 2 }),
        src("c", { frequencyMinutes: 10, priority: 3 }),
        src("d", { frequencyMinutes: 20, priority: 3, editorialScore: 1 }),
      ],
    });
    const peekRateLimit = vi.fn(async (bucket: string) => bucket !== "crawler:a");
    const r = await runFastTick({ queue, runs, peekRateLimit, now: at("2026-09-27T14:20:00Z") });
    expect(r).toMatchObject({
      status: "started",
      enqueued: 1,
      skipped: [
        { slug: "a", reason: "rate_limited" },
        { slug: "c", reason: "previous_pending" },
        { slug: "d", reason: "fast_lane_full" },
      ],
    });
    expect(peekRateLimit).toHaveBeenCalledWith("crawler:a", 6);
    expect(queue.messages().map((m) => m.itemRef)).toEqual(["source:c", "source:b"]);
    expect(runs.created[0]!.stats).toMatchObject({
      fetch_enqueued: 1,
      skipped: [
        { slug: "a", reason: "rate_limited" },
        { slug: "c", reason: "previous_pending" },
        { slug: "d", reason: "fast_lane_full" },
      ],
    });
  });

  it("15 min coletada às 14:02 não vence às 14:10 e vence às 14:20", async () => {
    const sources = [src("q", { frequencyMinutes: 15, lastFetchedAt: "2026-09-27T14:02:00Z" })];
    const early = await runFastTick({
      queue: createMemoryQueue(),
      runs: createMemoryRunStore({ sources }),
      peekRateLimit: allow,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(early).toMatchObject({ status: "started", enqueued: 0 });
    const later = await runFastTick({
      queue: createMemoryQueue(),
      runs: createMemoryRunStore({ sources }),
      peekRateLimit: allow,
      now: at("2026-09-27T14:20:00Z"),
    });
    expect(later).toMatchObject({ status: "started", enqueued: 1 });
  });

  it("fonte de 10 min com Crawl-delay 900 fica fora do tick rápido", async () => {
    const queue = createMemoryQueue();
    const r = await runFastTick({
      queue,
      runs: createMemoryRunStore({
        sources: [
          src("rapida", { frequencyMinutes: 10 }),
          src("lenta", { frequencyMinutes: 10, crawlDelaySec: 900 }),
        ],
      }),
      peekRateLimit: allow,
      now: at("2026-09-27T14:30:00Z"),
    });
    expect(r).toMatchObject({ enqueued: 1 });
    expect(queue.messages().map((m) => m.itemRef)).toEqual(["source:rapida"]);
  });
});

describe("tick rápido concorrente (fix round 1, #3/#4)", () => {
  it("dois ticks na mesma janela: o perdedor não sobrescreve as estatísticas do vencedor", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore({ sources: [src("rapida", { frequencyMinutes: 10 })] });
    const now = at("2026-09-27T14:10:00Z");
    await Promise.all([
      runFastTick({ queue, runs, peekRateLimit: allow, now }),
      runFastTick({ queue, runs, peekRateLimit: allow, now }),
    ]);
    expect(queue.messages()).toHaveLength(1);
    expect(runs.created).toHaveLength(1);
    expect(runs.created[0]!.stats).toEqual({ fetch_enqueued: 1, skipped: [] });
  });
});

describe("handleFastTick", () => {
  const req = (secret?: string) =>
    new Request("http://localhost/api/ingest/fast-tick", {
      method: "POST",
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
  const deps = () => ({
    queue: createMemoryQueue(),
    runs: createMemoryRunStore({ sources: [src("rapida", { frequencyMinutes: 10 })] }),
    peekRateLimit: allow,
    now: at("2026-09-27T14:10:00Z"),
    secret: "segredo-de-teste-com-32-caracteres!!",
  });

  it("sem o segredo devolve 401 e não roda o tick", async () => {
    const d = deps();
    expect((await handleFastTick(req(), d)).status).toBe(401);
    expect((await handleFastTick(req("errado"), d)).status).toBe(401);
    expect(d.runs.created).toHaveLength(0);
  });

  it("com o segredo devolve o resultado do runFastTick", async () => {
    const d = deps();
    const res = await handleFastTick(req(d.secret), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "started", enqueued: 1 });
  });
});
