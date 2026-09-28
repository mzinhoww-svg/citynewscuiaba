import { dueSources, runTick } from "./tick";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore, dueSource, type DueSourceInput } from "./testing/memory-run-store";

const NOW = new Date("2026-09-27T14:44:10Z");
const at = (iso: string) => () => new Date(iso);
const src = (slug: string, o: Omit<DueSourceInput, "slug"> = {}): DueSourceInput => ({
  slug,
  ...o,
});

describe("fontes devidas (vencimento por janela, D-F17)", () => {
  const due = (sources: DueSourceInput[], now: Date, lane: "normal" | "fast" = "normal") =>
    dueSources(sources.map(dueSource), now, 30, lane).map((s) => s.slug);

  it("nunca coletada, ou com a janela da última coleta a F minutos de distância, é devida", () => {
    expect(
      due(
        [
          src("a"),
          src("b", { lastFetchedAt: "2026-09-27T14:10:00Z" }),
          src("c", { lastFetchedAt: "2026-09-27T14:30:00Z" }),
          src("d", { frequencyMinutes: 60, lastFetchedAt: "2026-09-27T13:50:00Z" }),
          src("e", { frequencyMinutes: 60, lastFetchedAt: "2026-09-27T13:59:00Z" }),
          src("f", { frequencyMinutes: 60, lastFetchedAt: "2026-09-27T14:05:00Z" }),
        ],
        NOW,
      ),
    ).toEqual(["a", "b", "d", "e"]);
  });

  it("30 min coletada às 14:07 vence às 14:30 (Review Focus 4)", () => {
    const s = [src("a", { lastFetchedAt: "2026-09-27T14:07:00Z" })];
    expect(due(s, new Date("2026-09-27T14:30:00Z"))).toEqual(["a"]);
    expect(due(s, new Date("2026-09-27T14:29:59Z"))).toEqual([]);
  });

  it("data inválida em last_fetched_at conta como nunca coletada", () => {
    expect(due([src("a", { lastFetchedAt: "ontem" })], NOW)).toEqual(["a"]);
  });

  it("separa as vias: rápida só com lane fast, normal só com lane normal", () => {
    const s = [src("rapida", { frequencyMinutes: 10 }), src("normal")];
    expect(due(s, NOW, "normal")).toEqual(["normal"]);
    expect(due(s, NOW, "fast")).toEqual(["rapida"]);
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
    expect(runs.created[0]!.trigger).toBe("cron");
    expect(await queue.pending("pipeline", { steps: ["fetch"] })).toBe(2);
  });

  it("dois ticks na mesma janela: um run e nenhum fetch repetido", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    const a = await runTick({ queue, runs, now: () => NOW });
    const b = await runTick({ queue, runs, now: at("2026-09-27T14:59:00Z") });
    expect(b).toMatchObject({ status: "existing", runId: a.runId, enqueued: 0 });
    expect(runs.count()).toBe(1);
    expect(await queue.pending("pipeline")).toBe(1);
  });

  it("não começa enquanto o ciclo anterior não terminou a Coleta", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    const first = await runTick({ queue, runs, now: at("2026-09-27T14:05:00Z") });
    const second = await runTick({ queue, runs, now: () => NOW });
    expect(second).toMatchObject({
      status: "skipped",
      reason: "previous_collecting",
      runId: first.runId,
    });
    expect(runs.count()).toBe(1);
  });

  it("run fast ou manual aberto não segura o ciclo normal", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("folha-do-cerrado")]);
    const fast = await runs.startFastRun(new Date("2026-09-27T14:00:00Z"));
    await queue.enqueue("pipeline", {
      runId: fast.runId,
      step: "fetch",
      itemRef: "source:outra",
      attempt: 1,
    });
    await runs.startManualRun("src-outra");
    expect(await runTick({ queue, runs, now: () => NOW })).toMatchObject({ status: "started" });
  });

  it("tick normal ignora fontes da via rápida (Review Focus 6)", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("rapida", { frequencyMinutes: 10 }),
      src("normal", { frequencyMinutes: null }),
    ]);
    await runTick({ queue, runs, now: at("2026-09-27T14:30:00Z") });
    expect(queue.messages().map((m) => m.itemRef)).toEqual(["source:normal"]);
  });

  it("fonte de 10 min com Crawl-delay 900 volta ao tick normal", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("lenta", { frequencyMinutes: 10, crawlDelaySec: 900 })]);
    await runTick({ queue, runs, now: at("2026-09-27T14:30:00Z") });
    expect(queue.messages().map((m) => m.itemRef)).toEqual(["source:lenta"]);
  });

  it("coleta degraded, pula paused e segue prioridade e score", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([
      src("b", { priority: 2, editorialScore: 5 }),
      src("a", { priority: 1, editorialScore: 1 }),
      src("c", { status: "degraded", priority: 2, editorialScore: 3 }),
      src("d", { status: "paused" }),
    ]);
    await runTick({ queue, runs, now: at("2026-09-27T14:30:00Z") });
    expect(queue.messages().map((m) => m.itemRef)).toEqual(["source:a", "source:b", "source:c"]);
  });

  it("30 min coletada às 14:07 é enfileirada pelo tick das 14:30 (Review Focus 4)", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("a", { lastFetchedAt: "2026-09-27T14:07:00Z" })]);
    const r = await runTick({ queue, runs, now: at("2026-09-27T14:30:00Z") });
    expect(r).toMatchObject({ enqueued: 1 });
  });

  it("frequência null segue o padrão de app_settings", async () => {
    const sources = [src("a", { frequencyMinutes: null, lastFetchedAt: "2026-09-27T14:00:00Z" })];
    const early = createMemoryRunStore({ sources, defaultFrequency: 60 });
    expect(
      await runTick({ queue: createMemoryQueue(), runs: early, now: at("2026-09-27T14:30:00Z") }),
    ).toMatchObject({ enqueued: 0 });
    const later = createMemoryRunStore({ sources, defaultFrequency: 60 });
    expect(
      await runTick({ queue: createMemoryQueue(), runs: later, now: at("2026-09-27T15:00:00Z") }),
    ).toMatchObject({ enqueued: 1 });
  });

  it("dois ticks concorrentes: o perdedor não sobrescreve fetch_enqueued (fix round 1, #3/#4)", async () => {
    const queue = createMemoryQueue();
    const runs = createMemoryRunStore([src("a"), src("b")]);
    await Promise.all([
      runTick({ queue, runs, now: () => NOW }),
      runTick({ queue, runs, now: () => NOW }),
    ]);
    expect(runs.created).toHaveLength(1);
    expect(runs.created[0]!.stats).toEqual({ fetch_enqueued: 2 });
  });

  it("markFetchEnqueued só marca uma vez e preserva estatísticas anteriores", async () => {
    const runs = createMemoryRunStore([]);
    const { runId } = await runs.startManualRun("src-a");
    expect(await runs.markFetchEnqueued(runId, 1, { a: 1 })).toBe(true);
    expect(await runs.markFetchEnqueued(runId, 0, { a: 2 })).toBe(false);
    expect(runs.run(runId)!.stats).toEqual({ source: "src-a", a: 1, fetch_enqueued: 1 });
  });
});
