import { describe, expect, it } from "vitest";
import { collectNow } from "./collect-now";
import type { SourceRecord } from "./ports";
import { createMemoryIngestRepo } from "./testing/memory-ingest-repo";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore } from "./testing/memory-run-store";

const folha: SourceRecord = {
  id: "src-folha",
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  baseUrl: "https://folhadocerrado.example",
  kind: "rss",
  feedUrl: "https://folhadocerrado.example/feed",
  status: "active",
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
};

function setup(sources: SourceRecord[] = [folha], start = "2026-09-27T14:00:00Z") {
  let clock = new Date(start);
  const queue = createMemoryQueue();
  const runs = createMemoryRunStore({ clock: () => clock });
  const repo = createMemoryIngestRepo(sources);
  const deps = { runs, queue, repo, now: () => clock, actor: "user-helena" };
  return {
    queue,
    runs,
    deps,
    advance: (ms: number) => void (clock = new Date(clock.getTime() + ms)),
  };
}

describe("coletar agora", () => {
  it("cria run manual só com o fetch da fonte", async () => {
    const t = setup();
    const r = await collectNow("src-folha", t.deps);
    expect(r.ok).toBe(true);
    const runId = r.ok ? r.value.runId : "";
    expect(t.queue.enqueued).toEqual([
      { runId, step: "fetch", itemRef: `source:folha-do-cerrado:manual:${runId}`, attempt: 1 },
    ]);
    expect(t.runs.created[0]?.trigger).toBe("manual");
  });

  it("não se funde com um fetch agendado pendente da mesma fonte", async () => {
    const t = setup();
    await t.queue.enqueue("pipeline", {
      runId: "cron-1",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    expect((await collectNow("src-folha", t.deps)).ok).toBe(true);
    expect(await t.queue.pending("pipeline", { steps: ["fetch"] })).toBe(2);
  });

  it("segunda vez em menos de 5 min é recusada; depois de 5 min passa", async () => {
    const t = setup();
    expect((await collectNow("src-folha", t.deps)).ok).toBe(true);
    t.advance(4 * 60_000);
    expect(await collectNow("src-folha", t.deps)).toEqual({ ok: false, error: "rate_limited" });
    t.advance(60_000);
    expect((await collectNow("src-folha", t.deps)).ok).toBe(true);
  });

  it("fonte pausada, bloqueada ou inexistente é recusada", async () => {
    const t = setup([{ ...folha, status: "paused" }]);
    expect(await collectNow("src-folha", t.deps)).toEqual({ ok: false, error: "not_active" });
    expect(await collectNow("nao-existe", t.deps)).toEqual({ ok: false, error: "not_found" });
    expect(t.queue.enqueued).toHaveLength(0);
  });

  it("fonte degradada pode ser coletada", async () => {
    const t = setup([{ ...folha, status: "degraded" }]);
    expect((await collectNow("src-folha", t.deps)).ok).toBe(true);
  });

  it("21ª coleta da pessoa na hora é recusada (20/h por pessoa)", async () => {
    const fontes = Array.from({ length: 21 }, (_, i) => ({ ...folha, id: `s${i}`, slug: `f${i}` }));
    const t = setup(fontes);
    for (let i = 0; i < 20; i++) expect((await collectNow(`s${i}`, t.deps)).ok).toBe(true);
    expect(await collectNow("s20", t.deps)).toEqual({ ok: false, error: "rate_limited" });
  });
});
