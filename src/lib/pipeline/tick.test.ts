import { dueSources, runTick } from "./tick";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore } from "./testing/memory-run-store";

const NOW = new Date("2026-09-27T14:44:10Z");

describe("fontes devidas", () => {
  const src = (slug: string, lastFetchedAt: string | null, frequencyMinutes = 30) => ({
    slug,
    lastFetchedAt,
    frequencyMinutes,
  });
  it("nunca coletada, ou coletada há mais que a frequência, é devida", () => {
    expect(
      dueSources(
        [
          src("a", null),
          src("b", "2026-09-27T14:10:00Z"),
          src("c", "2026-09-27T14:30:00Z"),
          src("d", "2026-09-27T13:50:00Z", 60),
          src("e", "2026-09-27T13:40:00Z", 60),
        ],
        NOW,
      ).map((s) => s.slug),
    ).toEqual(["a", "b", "e"]);
  });
  it("tolera 2 min de atraso do cron", () => {
    expect(dueSources([src("a", "2026-09-27T14:16:00Z")], NOW)).toHaveLength(1);
  });
});

describe("tick", () => {
  it("cria o run da janela e enfileira um fetch por fonte devida", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      { slug: "folha-do-cerrado", frequencyMinutes: 30, lastFetchedAt: null },
      { slug: "mt-agora", frequencyMinutes: 30, lastFetchedAt: null },
    ]);
    const r = await runTick({ queue, runs, now: () => NOW });
    expect(r).toMatchObject({
      status: "started",
      enqueued: 2,
      windowStart: "2026-09-27T14:30:00.000Z",
    });
    expect(await queue.pending("pipeline", { steps: ["fetch"] })).toBe(2);
  });

  it("dois ticks na mesma janela: um run e nenhum fetch repetido", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      { slug: "folha-do-cerrado", frequencyMinutes: 30, lastFetchedAt: null },
    ]);
    const a = await runTick({ queue, runs, now: () => NOW });
    const b = await runTick({ queue, runs, now: () => new Date("2026-09-27T14:59:00Z") });
    expect(b).toMatchObject({ status: "existing", runId: a.runId, enqueued: 0 });
    expect(runs.count()).toBe(1);
    expect(await queue.pending("pipeline")).toBe(1);
  });

  it("não começa enquanto o ciclo anterior não terminou a Coleta", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      { slug: "folha-do-cerrado", frequencyMinutes: 30, lastFetchedAt: null },
    ]);
    const first = await runTick({ queue, runs, now: () => new Date("2026-09-27T14:05:00Z") });
    const second = await runTick({ queue, runs, now: () => NOW });
    expect(second).toMatchObject({
      status: "skipped",
      reason: "previous_collecting",
      runId: first.runId,
    });
    expect(runs.count()).toBe(1);
  });
});
