import { beforeEach, describe, expect, it, vi } from "vitest";

const audit = vi.fn();
vi.mock("@/lib/audit", () => ({ audit: (...a: unknown[]) => audit(...a) }));
vi.mock("@/lib/db/client", () => ({ createServiceClient: vi.fn(), createServerClient: vi.fn() }));
vi.mock("@/lib/db/queries/queue", () => ({
  QUEUE_TABS: ["all", "exceptions", "auto24h", "mine", "sensitive"],
  QUEUE_ORIGINS: ["original", "pipeline", "auto"],
  REVIEW_SELECTION_MAX: 2000,
  listReviewable: vi.fn(),
}));
vi.mock("@/lib/db/queries/review-risk", () => ({ loadRiskRows: vi.fn() }));
vi.mock("@/lib/pipeline/queue", () => ({ pipelineQueue: vi.fn() }));
vi.mock("./context", () => ({ studioContext: vi.fn() }));

import type { DbClient } from "@/lib/db/client";
import type { ReviewRiskRow } from "@/lib/db/queries/review-risk";
import type { Queue } from "@/lib/pipeline/queue";
import type { StudioContext } from "./context";
import { forcedPublishStatus, previewForcedPublish, startForcedPublish } from "./forced-publish";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const USER = "c1000000-0000-4000-8000-000000000001";

const rowOf = (n: number, over: Partial<ReviewRiskRow> = {}): ReviewRiskRow => ({
  id: uuid(n),
  title: `Matéria ${n}`,
  sectionSlug: "cidade",
  status: "in_review",
  sourceCount: 1,
  hasCitableSource: true,
  hasApprovedPhoto: false,
  wordCount: 200,
  shortReason: null,
  doubtful: false,
  confidence: "média",
  reported: false,
  hasBody: true,
  ...over,
});

function ctxFor(role: "editor_chefe" | "editor" | "jornalista", sections: string[] = []) {
  return {
    session: { userId: USER, email: "x@y", roles: [{ role, sections }] },
    db: {} as DbClient,
    revalidate: vi.fn(),
    now: () => new Date("2026-10-03T12:00:00Z"),
  } as unknown as StudioContext;
}

function fakeService() {
  const inserts: { table: string; row: Record<string, unknown> }[] = [];
  const updates: { table: string; row: Record<string, unknown> }[] = [];
  const db = {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          inserts.push({ table, row });
          return {
            select: () => ({ single: async () => ({ data: { id: "job-1" }, error: null }) }),
            then: (f: (v: { error: null }) => unknown) => f({ error: null }),
          };
        },
        update(row: Record<string, unknown>) {
          updates.push({ table, row });
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  } as unknown as DbClient;
  return { db, inserts, updates };
}

function fakeQueue(fail = false) {
  const enqueued: unknown[] = [];
  const queue = {
    enqueue: vi.fn(async (_q: string, msg: unknown) => {
      if (fail) throw new Error("fila fora do ar");
      enqueued.push(msg);
      return true;
    }),
  } as unknown as Queue;
  return { queue, enqueued };
}

beforeEach(() => audit.mockReset());

describe("previewForcedPublish", () => {
  it("papel que não publica é recusado", async () => {
    const load = vi.fn();
    const r = await previewForcedPublish({ ids: [uuid(1)] }, { ctx: ctxFor("jornalista"), load });
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    expect(load).not.toHaveBeenCalled();
  });

  it("entrada inválida é recusada", async () => {
    const r = await previewForcedPublish({ ids: ["x"] }, { ctx: ctxFor("editor_chefe") });
    expect(r).toMatchObject({ ok: false, error: "invalid" });
  });

  it("separa sem corpo, fora de revisão e fora da editoria do editor", async () => {
    const rows = [
      rowOf(1),
      rowOf(2, { hasBody: false, wordCount: 0 }),
      rowOf(3, { status: "draft" }),
      rowOf(4, { sectionSlug: "politica" }),
    ];
    const r = await previewForcedPublish(
      { ids: rows.map((x) => x.id) },
      { ctx: ctxFor("editor", ["cidade"]), load: async () => rows },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.summary.total).toBe(1);
    expect(r.value.excluded.map((e) => [e.id, e.reason]).sort()).toEqual(
      [
        [uuid(2), "no_body"],
        [uuid(3), "status"],
        [uuid(4), "forbidden"],
      ].sort(),
    );
  });
});

describe("startForcedPublish", () => {
  it("papel que não publica não grava nem enfileira nada", async () => {
    const svc = fakeService();
    const q = fakeQueue();
    const r = await startForcedPublish(
      { ids: [uuid(1)] },
      {
        ctx: ctxFor("jornalista"),
        load: async () => [rowOf(1)],
        service: () => svc.db,
        queue: () => q.queue,
      },
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
    expect(svc.inserts).toEqual([]);
    expect(q.enqueued).toEqual([]);
    expect(audit).not.toHaveBeenCalled();
  });

  it("enfileira lotes de 50, grava o trabalho, a decisão e a auditoria de quem forçou", async () => {
    const rows = Array.from({ length: 120 }, (_, i) => rowOf(i + 1));
    const svc = fakeService();
    const q = fakeQueue();
    const r = await startForcedPublish(
      { ids: rows.map((x) => x.id) },
      {
        ctx: ctxFor("editor_chefe"),
        load: async () => rows,
        service: () => svc.db,
        queue: () => q.queue,
      },
    );
    expect(r).toMatchObject({ ok: true, value: { jobId: "job-1", total: 120, excluded: [] } });

    const job = svc.inserts.find((i) => i.table === "forced_publish_jobs")!.row;
    expect(job.requested_by).toBe(USER);
    expect(job.total).toBe(120);
    expect((job.batches as string[][]).map((b) => b.length)).toEqual([50, 50, 20]);
    expect(JSON.stringify(job.risks)).toContain("single_source");

    expect(q.enqueued).toEqual(
      [0, 1, 2].map((i) => ({
        runId: "forced",
        step: "forced_publish",
        itemRef: `forced:job-1:${i}`,
        attempt: 1,
      })),
    );

    const decision = svc.inserts.find((i) => i.table === "decisions")!.row;
    expect(decision).toMatchObject({
      object_ref: "forced_publish:job-1",
      step: "publish",
      human_decision: "forced_publish",
      human_id: USER,
    });
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit.mock.calls[0]!.slice(0, 3)).toEqual([
      USER,
      "article.force_publish",
      "forced_publish:job-1",
    ]);
    expect(audit.mock.calls[0]![3]).toMatchObject({
      total: 120,
      excluded: 0,
      batches: 3,
      mode: "ids",
    });
  });

  it("matérias sem corpo ficam de fora e voltam no resultado; o resto publica", async () => {
    const rows = [
      rowOf(1),
      rowOf(2, { hasBody: false, wordCount: 0 }),
      rowOf(3, { sectionSlug: "saude" }),
    ];
    const svc = fakeService();
    const q = fakeQueue();
    const r = await startForcedPublish(
      { filter: { tab: "all" } },
      {
        ctx: ctxFor("editor_chefe"),
        load: async () => rows,
        service: () => svc.db,
        queue: () => q.queue,
      },
    );
    expect(r.ok && r.value.total).toBe(2);
    expect(r.ok && r.value.excluded).toEqual([
      { id: uuid(2), title: "Matéria 2", reason: "no_body" },
    ]);
    expect(audit.mock.calls[0]![3]).toMatchObject({ mode: "filter", excluded: 1 });
    expect(JSON.stringify(audit.mock.calls[0]![3])).toContain("sensitive_saude");
  });

  it("nada publicável: recusa sem gravar", async () => {
    const svc = fakeService();
    const r = await startForcedPublish(
      { ids: [uuid(2)] },
      {
        ctx: ctxFor("editor_chefe"),
        load: async () => [rowOf(2, { hasBody: false })],
        service: () => svc.db,
        queue: () => fakeQueue().queue,
      },
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect(svc.inserts).toEqual([]);
  });

  it("falha ao enfileirar encerra o trabalho com a falha e propaga o erro", async () => {
    const svc = fakeService();
    await expect(
      startForcedPublish(
        { ids: [uuid(1)] },
        {
          ctx: ctxFor("editor_chefe"),
          load: async () => [rowOf(1)],
          service: () => svc.db,
          queue: () => fakeQueue(true).queue,
        },
      ),
    ).rejects.toThrow("fila fora do ar");
    expect(svc.updates[0]!.row).toMatchObject({ status: "done", failed: 1 });
  });
});

describe("forcedPublishStatus", () => {
  it("id inválido e papel sem permissão", async () => {
    expect(await forcedPublishStatus("x", { ctx: ctxFor("editor_chefe") })).toMatchObject({
      ok: false,
      error: "invalid",
    });
    expect(await forcedPublishStatus(uuid(9), { ctx: ctxFor("jornalista") })).toMatchObject({
      ok: false,
      error: "forbidden",
    });
  });
});
