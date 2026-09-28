import { createMemoryQueue } from "./testing/memory-queue";
import { manualWindowStart, runNow, type RunNowRepo } from "./run-now";

function repo(over: Partial<RunNowRepo> = {}) {
  const created: { windowStart: string; stats: Record<string, unknown> }[] = [];
  const r: RunNowRepo & { created: typeof created } = {
    created,
    latestRunId: async () => null,
    createManualRun: async (windowStart, stats) => {
      created.push({ windowStart: windowStart.toISOString(), stats });
      return "run-manual";
    },
    activeSources: async () => [
      { id: "s1", slug: "folha-do-cerrado" },
      { id: "s2", slug: "mt-agora" },
    ],
    source: async (id) =>
      id === "s1"
        ? { id: "s1", slug: "folha-do-cerrado", status: "active" }
        : id === "s3"
          ? { id: "s3", slug: "portal-varzea", status: "paused" }
          : null,
    ...over,
  };
  return r;
}

const at = (iso: string) => () => new Date(iso);

describe("manualWindowStart", () => {
  it("usa o próprio instante, fora das janelas de :00 e :30", () => {
    expect(manualWindowStart(new Date("2026-09-28T13:07:09.123Z")).toISOString()).toBe(
      "2026-09-28T13:07:09.123Z",
    );
    // No limite exato de uma janela, desloca 1 ms para não disputar o run do cron.
    expect(manualWindowStart(new Date("2026-09-28T13:30:00.000Z")).toISOString()).toBe(
      "2026-09-28T13:30:00.001Z",
    );
  });
});

describe("runNow", () => {
  it("cria um run manual com janela própria e enfileira a coleta de todas as fontes ativas", async () => {
    const q = createMemoryQueue();
    const rp = repo();
    const r = await runNow(
      { queue: q, repo: rp, now: at("2026-09-28T13:07:09.123Z") },
      { requestedBy: "u1" },
    );
    expect(r).toEqual({
      ok: true,
      value: { runId: "run-manual", windowStart: "2026-09-28T13:07:09.123Z", enqueued: 2 },
    });
    expect(rp.created[0]?.stats).toMatchObject({ manual: true, requested_by: "u1" });
    expect(q.messages().map((m) => [m.runId, m.step, m.itemRef])).toEqual([
      ["run-manual", "fetch", "source:folha-do-cerrado"],
      ["run-manual", "fetch", "source:mt-agora"],
    ]);
  });

  it("só uma fonte quando pedida, e recusa fonte pausada ou inexistente", async () => {
    const q = createMemoryQueue();
    const now = at("2026-09-28T13:07:09Z");
    const one = await runNow(
      { queue: q, repo: repo(), now },
      { requestedBy: "u1", sourceId: "s1" },
    );
    expect(one.ok && one.value.enqueued).toBe(1);
    expect(
      await runNow({ queue: q, repo: repo(), now }, { requestedBy: "u1", sourceId: "s3" }),
    ).toEqual({ ok: false, error: "source_inactive" });
    expect(
      await runNow({ queue: q, repo: repo(), now }, { requestedBy: "u1", sourceId: "x" }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("não começa enquanto o ciclo anterior ainda estiver coletando", async () => {
    const q = createMemoryQueue();
    await q.enqueue("pipeline", {
      runId: "run-anterior",
      step: "extract",
      itemRef: "raw:1",
      attempt: 1,
    });
    const rp = repo({ latestRunId: async () => "run-anterior" });
    const r = await runNow(
      { queue: q, repo: rp, now: at("2026-09-28T13:07:09Z") },
      { requestedBy: "u1" },
    );
    expect(r).toEqual({ ok: false, error: "collecting" });
    expect(rp.created).toHaveLength(0);
  });
});
