import { collectNow, type CollectNowDeps } from "./collect-now";
import type { SourceRecord } from "./ports";
import { createMemoryIngestRepo } from "./testing/memory-ingest-repo";
import { createMemoryQueue } from "./testing/memory-queue";
import { createMemoryRunStore } from "./testing/memory-run-store";

const FOLHA_ID = "src-folha";
const folha: SourceRecord = {
  id: FOLHA_ID,
  slug: "folha-do-cerrado",
  name: "Folha do Cerrado",
  baseUrl: "https://folhadocerrado.example",
  kind: "rss",
  feedUrl: "https://folhadocerrado.example/feed",
  status: "active",
  statusReason: null,
  consecutiveFailures: 0,
  rateLimitPerHour: 60,
  locality: "cuiaba",
  etag: null,
  lastModified: null,
  consumption: {},
};

function setup(sources: SourceRecord[] = [folha], actor = "helena") {
  const queue = createMemoryQueue();
  const runs = createMemoryRunStore([]);
  const repo = createMemoryIngestRepo(sources);
  const hits = new Map<string, number>();
  const limits: [string, number, number][] = [];
  const hitRateLimit = async (bucket: string, key: string, limit: number, windowSec: number) => {
    limits.push([bucket, limit, windowSec]);
    const k = `${bucket}:${key}`;
    const n = (hits.get(k) ?? 0) + 1;
    hits.set(k, n);
    return n <= limit;
  };
  const peekRateLimit = async (bucket: string, key: string, limit: number) =>
    (hits.get(`${bucket}:${key}`) ?? 0) < limit;
  const deps = (who = actor): CollectNowDeps => ({
    runs,
    queue,
    repo,
    hitRateLimit,
    peekRateLimit,
    actor: who,
  });
  return { queue, runs, deps, limits };
}

describe("Coletar agora (D-F21, §7.4)", () => {
  it("cria run manual só com o fetch da fonte", async () => {
    const { queue, runs, deps } = setup();
    const r = await collectNow(FOLHA_ID, deps());
    expect(r.ok).toBe(true);
    const runId = r.ok ? r.value.runId : "";
    expect(queue.messages()).toEqual([
      expect.objectContaining({ step: "fetch", itemRef: "source:folha-do-cerrado", runId }),
    ]);
    expect(runs.created).toHaveLength(1);
    expect(runs.created[0]!.trigger).toBe("manual");
    expect(await runs.lastStartedAt()).toBeNull();
  });

  it("usa chave própria na fila: convive com o fetch pendente do ciclo normal", async () => {
    const { queue, deps } = setup();
    await queue.enqueue("pipeline", {
      runId: "cron-run",
      step: "fetch",
      itemRef: "source:folha-do-cerrado",
      attempt: 1,
    });
    const r = await collectNow(FOLHA_ID, deps());
    expect(r.ok).toBe(true);
    expect(await queue.pending("pipeline", { itemRef: "source:folha-do-cerrado" })).toBe(2);
  });

  it("segunda vez em menos de 5 min é recusada; pausada é recusada; inexistente é not_found", async () => {
    const { deps, limits } = setup([
      folha,
      { ...folha, id: "src-pausada", slug: "pausada", status: "paused" },
      { ...folha, id: "src-degradada", slug: "degradada", status: "degraded" },
    ]);
    expect((await collectNow(FOLHA_ID, deps())).ok).toBe(true);
    expect(await collectNow(FOLHA_ID, deps("outra-pessoa"))).toEqual({
      ok: false,
      error: "rate_limited",
    });
    expect(limits).toContainEqual(["collect_now_source", 1, 300]);
    expect(limits).toContainEqual(["collect_now_actor", 20, 3600]);
    expect(await collectNow("src-pausada", deps())).toEqual({ ok: false, error: "not_active" });
    expect(await collectNow("src-nada", deps())).toEqual({ ok: false, error: "not_found" });
    expect((await collectNow("src-degradada", deps())).ok).toBe(true);
  });

  it("no máximo 20 por hora por pessoa", async () => {
    const sources = Array.from({ length: 21 }, (_, i) => ({
      ...folha,
      id: `src-${i}`,
      slug: `fonte-${i}`,
    }));
    const { deps } = setup(sources);
    for (let i = 0; i < 20; i++) expect((await collectNow(`src-${i}`, deps())).ok).toBe(true);
    expect(await collectNow("src-20", deps())).toEqual({ ok: false, error: "rate_limited" });
    expect((await collectNow("src-20", deps("outra-pessoa"))).ok).toBe(true);
  });

  it("fonte no limite de 5 min não gasta a cota da pessoa (fix round 1, #8)", async () => {
    const { deps, limits } = setup();
    expect((await collectNow(FOLHA_ID, deps())).ok).toBe(true);
    const before = limits.length;
    for (let i = 0; i < 25; i++)
      expect(await collectNow(FOLHA_ID, deps())).toEqual({ ok: false, error: "rate_limited" });
    expect(limits.slice(before).filter(([b]) => b === "collect_now_actor")).toEqual([]);
  });
});
