import { describe, expect, it } from "vitest";
import { ingestStatus, LATE_AFTER_MIN } from "./status";
import { createMemoryQueue } from "./testing/memory-queue";

const at = (iso: string) => () => new Date(iso);

describe("status do ciclo (watchdog)", () => {
  it("atrasado depois de 45 min sem novo ciclo", async () => {
    const queue = createMemoryQueue();
    const runs = { lastStartedAt: async () => "2026-09-27T14:00:00.000Z" };
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
      runs: { lastStartedAt: async () => null },
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
      runs: { lastStartedAt: async () => "2026-09-27T14:00:00.000Z" },
      queue,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(r.pending).toEqual({ pipeline: 1, media: 1, notify: 0, total: 2 });
  });
});
