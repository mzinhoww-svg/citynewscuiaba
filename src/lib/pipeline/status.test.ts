import { describe, expect, it } from "vitest";
import { FAST_LATE_AFTER_MIN, ingestStatus, LATE_AFTER_MIN } from "./status";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore, type DueSourceInput } from "./testing/memory-run-store";

const at = (iso: string) => () => new Date(iso);

/** RunStore mínimo do status: último `cron`, último `fast` e as fontes ativas. */
function runsWith(
  o: { cron?: string | null; fast?: string | null; sources?: DueSourceInput[] } = {},
) {
  const base = createMemoryRunStore({ sources: o.sources ?? [] });
  return {
    ...base,
    lastStartedAt: async () => o.cron ?? null,
    lastFastStartedAt: async () => o.fast ?? null,
  };
}

describe("status do ciclo (watchdog)", () => {
  it("atrasado depois de 45 min sem novo ciclo", async () => {
    const queue = createMemoryQueue();
    const runs = runsWith({ cron: "2026-09-27T14:00:00.000Z" });
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
      runs: runsWith(),
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
      runs: runsWith({ cron: "2026-09-27T14:00:00.000Z" }),
      queue,
      now: at("2026-09-27T14:10:00Z"),
    });
    expect(r.pending).toEqual({ pipeline: 1, media: 1, notify: 0, total: 2 });
  });

  it("bloco fast: late só com fonte rápida ativa e último run fast há mais de 15 min; late do topo ignora runs fast e manuais", async () => {
    expect(FAST_LATE_AFTER_MIN).toBe(15);
    const queue = createMemoryQueue();
    const rapida: DueSourceInput = { slug: "rapida", frequencyMinutes: 10 };

    // Só runs fast recentes e nenhum cron: o topo continua atrasado.
    const withFast = runsWith({ fast: "2026-09-27T14:00:00.000Z", sources: [rapida] });
    const fresh = await ingestStatus({ runs: withFast, queue, now: at("2026-09-27T14:15:00Z") });
    expect(fresh).toMatchObject({
      late: true,
      lastStartedAt: null,
      fast: {
        lastStartedAt: "2026-09-27T14:00:00.000Z",
        ageMinutes: 15,
        late: false,
        sources: 1,
      },
    });
    const stale = await ingestStatus({ runs: withFast, queue, now: at("2026-09-27T14:16:00Z") });
    expect(stale.fast).toMatchObject({ ageMinutes: 16, late: true });

    // Sem fonte rápida ativa (pausada, ou devolvida ao ciclo normal pelo robots): nunca late.
    const none = runsWith({
      sources: [
        { slug: "pausada", frequencyMinutes: 10, status: "paused" },
        { slug: "lenta", frequencyMinutes: 10, crawlDelaySec: 900 },
        { slug: "normal" },
      ],
    });
    expect(
      (await ingestStatus({ runs: none, queue, now: at("2026-09-27T14:16:00Z") })).fast,
    ).toEqual({ lastStartedAt: null, ageMinutes: null, late: false, sources: 0 });
    // Com fonte rápida e nenhum run fast: late.
    expect(
      (
        await ingestStatus({
          runs: runsWith({ sources: [rapida] }),
          queue,
          now: at("2026-09-27T14:16:00Z"),
        })
      ).fast.late,
    ).toBe(true);
  });

  it("memória: lastStartedAt só conta runs cron", async () => {
    const runs = createMemoryRunStore([]);
    await runs.startFastRun(new Date("2026-09-27T14:10:00Z"));
    await runs.startManualRun("src-x");
    expect(await runs.lastStartedAt()).toBeNull();
    expect(await runs.lastFastStartedAt()).not.toBeNull();
    await runs.startRun(new Date("2026-09-27T14:00:00Z"));
    expect(await runs.lastStartedAt()).not.toBeNull();
  });
});
