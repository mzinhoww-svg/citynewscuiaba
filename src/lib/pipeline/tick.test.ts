import { describe, expect, it } from "vitest";
import { dueSources, runTick } from "./tick";
import { dueSource as src } from "./testing/due-source";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore } from "./testing/memory-run-store";

const NOW = new Date("2026-09-27T14:44:10Z");
const TICK = new Date("2026-09-27T14:30:00Z");

describe("fontes devidas", () => {
  it("nunca coletada ou coletada em janela anterior à frequência é devida", () => {
    expect(
      dueSources(
        [
          src("a", { lastFetchedAt: null }),
          src("b", { lastFetchedAt: "2026-09-27T14:10:00Z" }),
          src("c", { lastFetchedAt: "2026-09-27T14:30:00Z" }),
          src("d", { lastFetchedAt: "2026-09-27T14:00:00Z", frequencyMinutes: 60 }),
          src("e", { lastFetchedAt: "2026-09-27T13:40:00Z", frequencyMinutes: 60 }),
        ],
        NOW,
        30,
        "normal",
      ).map((s) => s.slug),
    ).toEqual(["a", "b", "e"]);
  });

  it("30 min coletada às 14:07 vence no tick de 14:30 (Review Focus 4)", () => {
    const s = src("a", { lastFetchedAt: "2026-09-27T14:07:00Z" });
    expect(dueSources([s], new Date("2026-09-27T14:30:00Z"), 30, "normal")).toHaveLength(1);
    expect(dueSources([s], new Date("2026-09-27T14:29:00Z"), 30, "normal")).toHaveLength(0);
  });

  it("ordena por prioridade, score (maior primeiro) e slug", () => {
    const out = dueSources(
      [
        src("z", { priority: 2, editorialScore: 5 }),
        src("y", { priority: 1, editorialScore: 1 }),
        src("b", { priority: 2, editorialScore: 3 }),
        src("a", { priority: 2, editorialScore: 3 }),
      ],
      TICK,
      30,
      "normal",
    );
    expect(out.map((s) => s.slug)).toEqual(["y", "z", "a", "b"]);
  });
});

describe("tick", () => {
  it("cria o run da janela e enfileira um fetch por fonte devida", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado"), src("mt-agora")]);
    const r = await runTick({ queue, runs, now: () => NOW });
    expect(r).toMatchObject({
      status: "started",
      enqueued: 2,
      windowStart: "2026-09-27T14:30:00.000Z",
    });
    expect(await queue.pending("pipeline", { steps: ["fetch"] })).toBe(2);
    expect(runs.created[0]?.trigger).toBe("cron");
  });

  it("dois ticks na mesma janela: um run e nenhum fetch repetido", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    const a = await runTick({ queue, runs, now: () => NOW });
    const b = await runTick({ queue, runs, now: () => new Date("2026-09-27T14:59:00Z") });
    expect(b).toMatchObject({ status: "existing", runId: a.runId, enqueued: 0 });
    expect(runs.count()).toBe(1);
    expect(await queue.pending("pipeline")).toBe(1);
  });

  it("não começa enquanto o ciclo anterior não terminou a Coleta", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    const first = await runTick({ queue, runs, now: () => new Date("2026-09-27T14:05:00Z") });
    const second = await runTick({ queue, runs, now: () => NOW });
    expect(second).toMatchObject({
      status: "skipped",
      reason: "previous_collecting",
      runId: first.runId,
    });
    expect(runs.count()).toBe(1);
  });

  it("um run fast aberto não bloqueia o ciclo normal", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    await runs.startFastRun(new Date("2026-09-27T14:20:00Z"));
    expect(await runTick({ queue, runs, now: () => NOW })).toMatchObject({
      status: "started",
      enqueued: 1,
    });
  });

  it("tick normal ignora fontes da via rápida (Review Focus 6)", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("rapida", { frequencyMinutes: 10 }),
      src("normal", { frequencyMinutes: null }),
    ]);
    await runTick({ queue, runs, now: () => TICK });
    expect(queue.enqueued.map((m) => m.itemRef)).toEqual(["source:normal"]);
  });

  it("fonte de 10 min com Crawl-delay 900 volta ao tick normal", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("lenta", { frequencyMinutes: 10, crawlDelaySec: 900 })]);
    await runTick({ queue, runs, now: () => TICK });
    expect(queue.enqueued.map((m) => m.itemRef)).toEqual(["source:lenta"]);
  });

  it("coleta degraded, pula paused e segue prioridade e score", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("b", { priority: 2, editorialScore: 5 }),
      src("a", { priority: 1, editorialScore: 1 }),
      src("c", { status: "degraded", priority: 2, editorialScore: 3 }),
      src("d", { status: "paused" }),
    ]);
    await runTick({ queue, runs, now: () => TICK });
    expect(queue.enqueued.map((m) => m.itemRef)).toEqual(["source:a", "source:b", "source:c"]);
  });

  it("frequência null segue o padrão de app_settings", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore({
      defaultFrequency: 60,
      sources: [src("a", { lastFetchedAt: "2026-09-27T14:00:00Z" })],
    });
    await runTick({ queue, runs, now: () => TICK });
    expect(queue.enqueued).toHaveLength(0);
    await runTick({ queue, runs, now: () => new Date("2026-09-27T15:00:00Z") });
    expect(queue.enqueued.map((m) => m.itemRef)).toEqual(["source:a"]);
  });
});
