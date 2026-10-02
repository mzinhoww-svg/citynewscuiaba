// @vitest-environment node
// P5-T3: reprocessamento com `keepHumanDecisions` e "Executar agora" contra o banco local.
// Review Focus 3: reprocessar itens que já têm decisão humana mantém as decisões por padrão.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createReprocessRepo, createRunNowRepo } from "@/lib/db/control-store";
import { createQueue } from "@/lib/pipeline/queue";
import { reprocess, retryQuarantined } from "@/lib/pipeline/reprocess";
import { runNow } from "@/lib/pipeline/run-now";
import { windowStart } from "@/lib/pipeline/window";
import { pipelineTrash, purgePipeline } from "./cleanup";
import { SEED_USERS, service } from "./studio";

const FOLHA = "c5000000-0000-4000-8000-000000000001";
const ns = `reproc-${randomUUID().slice(0, 8)}`;
const trash = pipelineTrash();
trash.namespaces.add(ns);
const queue = createQueue(service, { namespace: ns });
const queues = [`${ns}:pipeline`, `${ns}:media`, `${ns}:notify`];
const repo = createReprocessRepo(service, { actorId: SEED_USERS.diego.id, queues });

const runId = randomUUID();
const rawId = randomUUID();
const topics = { human: randomUUID(), auto: randomUUID() };
const items = { human: randomUUID(), auto: randomUUID() };
const articles = { human: randomUUID(), auto: randomUUID() };
const quarantineIds: number[] = [];

async function humanDecisions() {
  const { data, error } = await service
    .from("decisions")
    .select("object_ref, human_decision, human_id")
    .eq("object_ref", `article:${articles.human}`)
    .order("created_at");
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  trash.runIds.add(runId);
  // Janela antiga e única: não colide com o seed nem com outras suítes.
  const ws = new Date(Date.UTC(2001, 0, 1) + Math.floor(Math.random() * 1e9) * 1000);
  const must = (r: { error: { message: string } | null }) => {
    if (r.error) throw new Error(r.error.message);
  };
  must(await service.from("ingest_runs").insert({ id: runId, window_start: ws.toISOString() }));
  must(
    await service.from("raw_items").insert({
      id: rawId,
      run_id: runId,
      source_id: FOLHA,
      payload: { url: "https://folhadocerrado.example/feed", status: 200, body: "" },
    }),
  );
  for (const k of ["human", "auto"] as const) {
    must(
      await service
        .from("topics")
        .insert({ id: topics[k], slug: `reproc-${topics[k]}`, title: `Assunto ${k}` }),
    );
    trash.itemIds.add(items[k]);
    must(
      await service.from("collected_items").insert({
        id: items[k],
        raw_id: rawId,
        source_id: FOLHA,
        canonical_url: `https://folhadocerrado.example/reproc/${items[k]}`,
        original_title: `Item ${k}`,
        topic_id: topics[k],
      }),
    );
    must(
      await service.from("articles").insert({
        id: articles[k],
        slug: `reproc-${articles[k]}`,
        kind: "normalized",
        topic_id: topics[k],
        section_slug: "cidade",
        title: `Matéria ${k}`,
        dek: "Linha fina.",
        body: { type: "doc", content: [] },
        status: "in_review",
        agent_id: "write",
      }),
    );
  }
  must(
    await service.from("decisions").insert({
      object_ref: `article:${articles.human}`,
      step: "review",
      input_hash: `reproc-${articles.human}`,
      output: { action: "approve" },
      human_decision: "approve",
      human_id: SEED_USERS.marina.id,
    }),
  );
  const q = await service
    .from("pipeline_quarantine")
    .insert([
      {
        queue: `${ns}:pipeline`,
        msg_id: 1,
        dedupe_key: `classify:item:${items.auto}`,
        message: { runId, step: "classify", itemRef: `item:${items.auto}`, attempt: 4 },
        read_ct: 4,
        error: "transient: timeout",
      },
      {
        queue: `${ns}:pipeline`,
        msg_id: 2,
        dedupe_key: `rules:article:${articles.human}`,
        message: { runId, step: "rules", itemRef: `article:${articles.human}`, attempt: 4 },
        read_ct: 4,
        error: "transient: timeout",
      },
    ])
    .select("id");
  must(q);
  quarantineIds.push(...(q.data ?? []).map((r) => r.id));
});

afterAll(async () => {
  await service
    .from("decisions")
    .delete()
    .in(
      "object_ref",
      Object.values(articles).map((a) => `article:${a}`),
    );
  await service.from("articles").delete().in("id", Object.values(articles));
  await purgePipeline(service, trash);
  await service.from("topics").delete().in("id", Object.values(topics));
});

describe("reprocess (banco)", () => {
  it("keepHumanDecisions = true: não altera decisions.human_decision e mantém a matéria fora", async () => {
    const before = await humanDecisions();
    const r = await reprocess(
      { queue, repo, now: () => new Date() },
      { scope: { runId }, fromStep: "rules", keepHumanDecisions: true },
    );
    expect(r).toEqual({
      ok: true,
      value: { targets: 2, enqueued: 1, skippedHuman: 1, alreadyQueued: 0 },
    });
    expect(await humanDecisions()).toEqual(before);
    expect(before).toEqual([
      {
        object_ref: `article:${articles.human}`,
        human_decision: "approve",
        human_id: SEED_USERS.marina.id,
      },
    ]);
    const { data } = await service
      .from("jobs")
      .select("message")
      .eq("queue", `${ns}:pipeline`)
      .like("dedupe_key", "rules:%");
    expect(data?.map((j) => (j.message as { itemRef: string }).itemRef)).toEqual([
      `article:${articles.auto}`,
    ]);
  });

  it("itens e assuntos herdam a decisão humana da matéria do assunto", async () => {
    const r = await reprocess(
      { queue, repo, now: () => new Date() },
      {
        scope: { itemIds: [items.human, items.auto] },
        fromStep: "classify",
        keepHumanDecisions: true,
      },
    );
    expect(r.ok && r.value).toMatchObject({ targets: 2, enqueued: 1, skippedHuman: 1 });
    const t = await reprocess(
      { queue, repo, now: () => new Date() },
      { scope: { runId }, fromStep: "verify", keepHumanDecisions: true },
    );
    expect(t.ok && t.value).toMatchObject({ targets: 2, enqueued: 1, skippedHuman: 1 });
  });

  it("keepHumanDecisions = false reenfileira também a matéria revisada, sem apagar a decisão", async () => {
    const before = await humanDecisions();
    const r = await reprocess(
      { queue, repo, now: () => new Date() },
      { scope: { runId }, fromStep: "rules", keepHumanDecisions: false },
    );
    expect(r.ok && r.value).toMatchObject({ targets: 2, enqueued: 1, alreadyQueued: 1 });
    expect(await humanDecisions()).toEqual(before);
  });

  it("fonte do ciclo a partir da coleta", async () => {
    const r = await reprocess(
      { queue, repo, now: () => new Date() },
      { scope: { runId }, fromStep: "fetch", keepHumanDecisions: true },
    );
    expect(r.ok && r.value.targets).toBe(1);
  });

  it("quarentena: devolve o que não tem decisão humana e resolve só o devolvido", async () => {
    await service.from("jobs").delete().like("queue", `${ns}:%`);
    const r = await retryQuarantined(
      { queue, repo, now: () => new Date() },
      { ids: quarantineIds, keepHumanDecisions: true },
    );
    expect(r.ok && r.value).toMatchObject({ enqueued: 1, skippedHuman: 1 });
    const { data } = await service
      .from("pipeline_quarantine")
      .select("dedupe_key, resolved_at, resolved_by")
      .in("id", quarantineIds)
      .order("id");
    expect(
      data?.map((q) => [q.dedupe_key.split(":")[0], q.resolved_at !== null, q.resolved_by]),
    ).toEqual([
      ["classify", true, SEED_USERS.diego.id],
      ["rules", false, null],
    ]);
  });
});

describe("Executar agora (banco)", () => {
  it("cria run fora da janela com window_start próprio e coleta as fontes ativas", async () => {
    const at = new Date(Date.UTC(2002, 5, 1, 12, 7, 9, 321));
    const r = await runNow(
      { queue, repo: createRunNowRepo(service), now: () => at },
      { requestedBy: SEED_USERS.diego.id },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    trash.runIds.add(r.value.runId);
    const { data } = await service
      .from("ingest_runs")
      .select("window_start, stats")
      .eq("id", r.value.runId)
      .single();
    expect(new Date(data!.window_start).toISOString()).toBe(at.toISOString());
    expect(new Date(data!.window_start).getTime()).not.toBe(windowStart(at).getTime());
    expect(data!.stats).toMatchObject({ manual: true, requested_by: SEED_USERS.diego.id });
    const { count } = await service
      .from("sources")
      .select("id", { count: "exact", head: true })
      .in("status", ["active", "degraded"]);
    expect(r.value.enqueued).toBe(count);
    expect(r.value.enqueued).toBeGreaterThan(0);
  });
});
