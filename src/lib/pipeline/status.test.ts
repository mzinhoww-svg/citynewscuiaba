import { describe, expect, it } from "vitest";
import { FAST_LATE_AFTER_MIN, ingestStatus, LATE_AFTER_MIN } from "./status";
import { dueSource } from "./testing/due-source";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore, type MemorySource } from "./testing/memory-run-store";

const at = (iso: string) => () => new Date(iso);

/** Runs mínimos para o status: só os horários mudam de um teste para o outro. */
const runsOf = (cron: string | null, fast: string | null = null, sources: MemorySource[] = []) => ({
  ...createMemoryRunStore(sources),
  lastStartedAt: async () => cron,
  lastFastStartedAt: async () => fast,
});

describe("status do ciclo (watchdog)", () => {
  it("atrasado depois de 45 min sem novo ciclo", async () => {
    const queue = createMemoryQueue();
    const runs = runsOf("2026-09-27T14:00:00.000Z");
    expect(LATE_AFTER_MIN).toBe(45);
    expect(await ingestStatus({ runs, queue, now: at("2026-09-27T14:45:00Z") })).toMatchObject({
      lastStartedAt: "2026-09-27T14:00:00.000Z",
      ageMinutes: 45,
      late: false,
    });
    expect((await ingestStatus({ runs, queue, now: at("2026-09-27T14:46:00Z") })).late).toBe(true);
  });

  it("sem ciclo registrado = atrasado", async () => {
    const r = await ingestStatus({
      runs: runsOf(null),
      queue: createMemoryQueue(),
      now: at("2026-09-27T14:00:00Z"),
    });
    expect(r).toMatchObject({ lastStartedAt: null, ageMinutes: null, late: true });
  });

  it("conta mensagens pendentes por fila (o watchdog chama o drain)", async () => {
    const queue = createMemoryQueue();
    await queue.enqueue("pipeline", { runId: "r", step: "fetch", itemRef: "source:a", attempt: 1 });
    await queue.enqueue("media", { runId: "r", step: "image", itemRef: "article:a", attempt: 1 });
    const r = await ingestStatus({
      runs: runsOf("2026-09-27T14:00:00.000Z"),
      queue,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(r.pending).toEqual({ pipeline: 1, media: 1, notify: 0, total: 2 });
  });
});

describe("bloco da via rápida", () => {
  const fastSource = dueSource("rapida", { frequencyMinutes: 10 });

  it("late só com fonte rápida ativa e último run fast há mais de 15 min", async () => {
    expect(FAST_LATE_AFTER_MIN).toBe(15);
    const queue = createMemoryQueue();
    const now = at("2026-09-27T14:30:00Z");
    const cron = "2026-09-27T14:30:00.000Z";
    const onTime = await ingestStatus({
      runs: runsOf(cron, "2026-09-27T14:15:00.000Z", [fastSource]),
      queue,
      now,
    });
    expect(onTime.fast).toMatchObject({ ageMinutes: 15, late: false, sources: 1 });
    const late = await ingestStatus({
      runs: runsOf(cron, "2026-09-27T14:14:00.000Z", [fastSource]),
      queue,
      now,
    });
    expect(late.fast).toMatchObject({ ageMinutes: 16, late: true, sources: 1 });
    const never = await ingestStatus({ runs: runsOf(cron, null, [fastSource]), queue, now });
    expect(never.fast).toMatchObject({ lastStartedAt: null, late: true });
  });

  it("sem fonte rápida ativa nunca fica late", async () => {
    const r = await ingestStatus({
      runs: runsOf("2026-09-27T14:30:00.000Z", null, [
        dueSource("normal"),
        dueSource("pausada", { frequencyMinutes: 10, status: "paused" }),
      ]),
      queue: createMemoryQueue(),
      now: at("2026-09-27T14:30:00Z"),
    });
    expect(r.fast).toEqual({ lastStartedAt: null, ageMinutes: null, late: false, sources: 0 });
  });

  it("late do topo ignora runs fast e manuais", async () => {
    const runs = createMemoryRunStore({ sources: [fastSource] });
    await runs.startFastRun(new Date("2026-09-27T14:20:00Z"));
    await runs.startManualRun("src-rapida");
    const r = await ingestStatus({
      runs,
      queue: createMemoryQueue(),
      now: at("2026-09-27T14:30:00Z"),
    });
    expect(r).toMatchObject({ lastStartedAt: null, late: true });
    expect(r.fast.lastStartedAt).not.toBeNull();
  });
});
