import { createMemoryQueue } from "./testing/memory-queue";
import {
  REPROCESS_STEPS,
  reprocess,
  reprocessRunRef,
  retryQuarantined,
  stepLevel,
  MAX_REPROCESS_TARGETS,
  reprocessImages,
  type ImageReprocessRepo,
  type ReprocessRepo,
} from "./reprocess";

function fakeRepo(over: Partial<ReprocessRepo> = {}): ReprocessRepo & {
  resolved: number[];
} {
  const resolved: number[] = [];
  return {
    resolved,
    refsFor: async (_scope, level) =>
      level === "article" ? ["article:a1", "article:a2", "article:a3"] : [`${level}:x`],
    humanDecided: async (refs) => new Set(refs.filter((r) => r === "article:a2")),
    quarantined: async () => [],
    resolveQuarantine: async (ids) => {
      resolved.push(...ids);
      return ids.length;
    },
    ...over,
  };
}

const NOW = () => new Date("2026-09-28T13:07:09Z");

describe("stepLevel", () => {
  it("mapeia cada etapa reprocessável para o tipo de referência da fila", () => {
    expect(stepLevel("fetch")).toBe("source");
    expect(stepLevel("extract")).toBe("raw");
    expect(stepLevel("classify")).toBe("item");
    expect(stepLevel("summarize")).toBe("topic");
    expect(stepLevel("rules")).toBe("article");
  });

  it("não oferece etapas que publicam direto, notificam ou dependem do índice do lote", () => {
    expect(REPROCESS_STEPS).not.toContain("publish");
    expect(REPROCESS_STEPS).not.toContain("notify");
    expect(REPROCESS_STEPS).not.toContain("normalize");
    expect(REPROCESS_STEPS).not.toContain("tick");
  });
});

describe("reprocess", () => {
  it("mantém decisões humanas por padrão: pula o objeto e não o enfileira", async () => {
    const q = createMemoryQueue();
    const r = await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { runId: "r1" }, fromStep: "rules", keepHumanDecisions: true },
    );
    expect(r).toEqual({
      ok: true,
      value: { targets: 3, enqueued: 2, skippedHuman: 1, alreadyQueued: 0 },
    });
    expect(q.messages().map((m) => m.itemRef)).toEqual(["article:a1", "article:a3"]);
  });

  it("sem manter decisões humanas, enfileira todos (a decisão continua registrada)", async () => {
    const q = createMemoryQueue();
    const r = await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { runId: "r1" }, fromStep: "rules", keepHumanDecisions: false },
    );
    expect(r.ok && r.value.enqueued).toBe(3);
    expect(r.ok && r.value.skippedHuman).toBe(0);
  });

  it("usa o run do escopo e, sem ele, um run de reprocessamento com data", async () => {
    const q = createMemoryQueue();
    await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { runId: "r1" }, fromStep: "classify", keepHumanDecisions: true },
    );
    await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { itemIds: ["i1"] }, fromStep: "verify", keepHumanDecisions: true },
    );
    expect(q.messages().map((m) => [m.runId, m.step, m.itemRef])).toEqual([
      ["r1", "classify", "item:x"],
      [reprocessRunRef(NOW()), "verify", "topic:x"],
    ]);
    expect(reprocessRunRef(NOW())).toBe("reprocess-20260928130709");
  });

  it("conta como já na fila o que o dedupe da fila recusa", async () => {
    const q = createMemoryQueue();
    await q.enqueue("pipeline", {
      runId: "r0",
      step: "rules",
      itemRef: "article:a1",
      attempt: 1,
    });
    const r = await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { runId: "r1" }, fromStep: "rules", keepHumanDecisions: true },
    );
    expect(r.ok && r.value).toMatchObject({ enqueued: 1, alreadyQueued: 1 });
  });

  it("imagem vai para a fila media", async () => {
    const q = createMemoryQueue();
    await reprocess(
      { queue: q, repo: fakeRepo(), now: NOW },
      { scope: { runId: "r1" }, fromStep: "image", keepHumanDecisions: false },
    );
    expect(await q.pending("media")).toBe(3);
  });

  it("recusa escopo vazio e etapa fora da lista", async () => {
    const q = createMemoryQueue();
    const deps = { queue: q, repo: fakeRepo(), now: NOW };
    expect(
      await reprocess(deps, { scope: {}, fromStep: "rules", keepHumanDecisions: true }),
    ).toEqual({ ok: false, error: "invalid" });
    expect(
      await reprocess(deps, {
        scope: { runId: "r1" },
        fromStep: "publish",
        keepHumanDecisions: true,
      }),
    ).toEqual({ ok: false, error: "invalid" });
  });
});

describe("retryQuarantined", () => {
  it("devolve à fila a mensagem da quarentena, zera a tentativa e marca como resolvida", async () => {
    const q = createMemoryQueue();
    const repo = fakeRepo({
      quarantined: async () => [
        { id: 7, message: { runId: "r1", step: "classify", itemRef: "item:i1", attempt: 4 } },
        { id: 8, message: { runId: "r1", step: "rules", itemRef: "article:a2", attempt: 4 } },
      ],
    });
    const r = await retryQuarantined(
      { queue: q, repo, now: NOW },
      { ids: [7, 8], keepHumanDecisions: true },
    );
    expect(r).toEqual({
      ok: true,
      value: { targets: 2, enqueued: 1, skippedHuman: 1, alreadyQueued: 0 },
    });
    expect(q.messages()).toEqual([
      { runId: "r1", step: "classify", itemRef: "item:i1", attempt: 1 },
    ]);
    expect(repo.resolved).toEqual([7]);
  });
});

describe("reprocessImages (UI-T16)", () => {
  const imageRepo = (ids: string[]): ImageReprocessRepo & { asked: number[] } => {
    const asked: number[] = [];
    return {
      asked,
      articlesNeedingImages: async (limit) => {
        asked.push(limit);
        return ids.slice(0, limit);
      },
    };
  };

  it("reenfileira o passo image das matérias sem imagem ou só com capa", async () => {
    const q = createMemoryQueue();
    const repo = imageRepo(["a1", "a2"]);
    const r = await reprocessImages({ queue: q, repo, now: NOW }, { limit: 50 });
    expect(r).toEqual({ targets: 2, enqueued: 2, alreadyQueued: 0 });
    expect(repo.asked).toEqual([50]);
    const msgs = q.messages("media");
    expect(msgs.map((m) => [m.step, m.itemRef])).toEqual([
      ["image", "article:a1"],
      ["image", "article:a2"],
    ]);
  });

  it("é idempotente: a mesma matéria já na fila não entra de novo", async () => {
    const q = createMemoryQueue();
    const deps = { queue: q, repo: imageRepo(["a1"]), now: NOW };
    await reprocessImages(deps, { limit: 10 });
    const again = await reprocessImages(deps, { limit: 10 });
    expect(again).toEqual({ targets: 1, enqueued: 0, alreadyQueued: 1 });
  });

  it("limita o lote e recusa limite inválido", async () => {
    const q = createMemoryQueue();
    const repo = imageRepo(["a1", "a2", "a3"]);
    const r = await reprocessImages({ queue: q, repo, now: NOW }, { limit: 2 });
    expect(r.targets).toBe(2);
    const huge = await reprocessImages({ queue: q, repo, now: NOW }, { limit: 10_000 });
    expect(repo.asked.at(-1)).toBe(MAX_REPROCESS_TARGETS);
    expect(huge.targets).toBeLessThanOrEqual(3);
    const bad = await reprocessImages({ queue: q, repo, now: NOW }, { limit: 0 });
    expect(bad.targets).toBe(0);
    expect(repo.asked.length).toBe(2);
  });
});
