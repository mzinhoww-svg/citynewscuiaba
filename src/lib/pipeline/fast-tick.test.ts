import { describe, expect, it, vi } from "vitest";
import { handleFastTick, runFastTick } from "./fast-tick";
import { dueSource as src } from "./testing/due-source";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore } from "./testing/memory-run-store";

const allow = async () => true;
const at = (iso: string) => () => new Date(iso);

describe("tick da via rápida", () => {
  it("cria um run fast por janela de 10 min e enfileira só fontes rápidas vencidas", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("rapida", { frequencyMinutes: 10, lastFetchedAt: "2026-09-27T14:03:00Z" }),
      src("normal", { frequencyMinutes: null }),
    ]);
    const now = at("2026-09-27T14:10:02Z");
    const r = await runFastTick({ queue, runs, peekRateLimit: allow, now });
    expect(r).toMatchObject({
      status: "started",
      windowStart: "2026-09-27T14:10:00.000Z",
      enqueued: 1,
    });
    expect(runs.created[0]?.trigger).toBe("fast");
    expect(queue.enqueued.map((m) => [m.step, m.itemRef])).toEqual([["fetch", "source:rapida"]]);
    expect(await runFastTick({ queue, runs, peekRateLimit: allow, now })).toMatchObject({
      status: "existing",
      enqueued: 0,
    });
    expect(queue.enqueued).toHaveLength(1);
  });

  it("sem fonte rápida ativa responde idle sem criar run", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("normal"),
      src("pausada", { frequencyMinutes: 10, status: "paused" }),
    ]);
    expect(
      await runFastTick({ queue, runs, peekRateLimit: allow, now: at("2026-09-27T14:10:00Z") }),
    ).toEqual({
      status: "idle",
    });
    expect(runs.created).toHaveLength(0);
  });

  it("pula rate_limited sem consumir cota, previous_pending e fast_lane_full", async () => {
    const queue = createMemoryQueue();
    // c: fetch pendente de um run cron.
    await queue.enqueue("pipeline", {
      runId: "run-cron",
      step: "fetch",
      itemRef: "source:c",
      attempt: 1,
    });
    const runs = createMemoryRunStore({
      fastLaneMax: 1,
      sources: [
        src("a", { priority: 1, frequencyMinutes: 10 }),
        src("b", { priority: 2, frequencyMinutes: 10 }),
        src("c", { priority: 3, frequencyMinutes: 10 }),
        src("d", { priority: 4, frequencyMinutes: 10 }),
      ],
    });
    const peek = vi.fn(async (bucket: string) => bucket !== "crawler:a");
    const r = await runFastTick({
      queue,
      runs,
      peekRateLimit: peek,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(r).toMatchObject({
      status: "started",
      enqueued: 1,
      skipped: [
        { slug: "a", reason: "rate_limited" },
        { slug: "c", reason: "previous_pending" },
        { slug: "d", reason: "fast_lane_full" },
      ],
    });
    expect(queue.enqueued.map((m) => m.itemRef)).toEqual(["source:c", "source:b"]);
    // Só consulta a cota (a, b); c e d nem chegam a ela ou já estão fora da vaga.
    expect(peek.mock.calls.map((c) => c[0])).toEqual(["crawler:a", "crawler:b", "crawler:d"]);
    expect(runs.created[0]?.stats).toMatchObject({ fetchEnqueued: 1 });
    expect(runs.created[0]?.stats?.skipped).toHaveLength(3);
  });

  it("15 min coletada às 14:02 não vence às 14:10 e vence às 14:20", async () => {
    const mk = () =>
      createMemoryRunStore([
        src("q", { frequencyMinutes: 15, lastFetchedAt: "2026-09-27T14:02:00Z" }),
      ]);
    const q1 = createMemoryQueue();
    await runFastTick({
      queue: q1,
      runs: mk(),
      peekRateLimit: allow,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(q1.enqueued).toHaveLength(0);
    const q2 = createMemoryQueue();
    await runFastTick({
      queue: q2,
      runs: mk(),
      peekRateLimit: allow,
      now: at("2026-09-27T14:20:00Z"),
    });
    expect(q2.enqueued.map((m) => m.itemRef)).toEqual(["source:q"]);
  });

  it("fonte rápida elevada por Crawl-delay não entra na via rápida", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("lenta", { frequencyMinutes: 10, crawlDelaySec: 900 })]);
    expect(
      await runFastTick({ queue, runs, peekRateLimit: allow, now: at("2026-09-27T14:10:00Z") }),
    ).toEqual({ status: "idle" });
  });
});

describe("handleFastTick", () => {
  const deps = () => ({
    queue: createMemoryQueue(),
    runs: createMemoryRunStore([src("rapida", { frequencyMinutes: 10 })]),
    peekRateLimit: allow,
    now: at("2026-09-27T14:10:00Z"),
    secret: "segredo",
  });
  it("sem o segredo devolve 401 e não toca a fila", async () => {
    const d = deps();
    const res = await handleFastTick(new Request("http://x", { method: "POST" }), d);
    expect(res.status).toBe(401);
    expect(d.runs.created).toHaveLength(0);
  });
  it("com o segredo devolve o resultado", async () => {
    const res = await handleFastTick(
      new Request("http://x", { method: "POST", headers: { authorization: "Bearer segredo" } }),
      deps(),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "started", enqueued: 1 });
  });
});
