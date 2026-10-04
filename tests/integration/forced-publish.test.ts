// @vitest-environment node
// REV-T1: "Publicar mesmo assim" de ponta a ponta no banco real: pedido (job, decisão, auditoria),
// lote publicado pela função `forced_publish_batch` (idempotente), atribuição, escopo de editoria,
// sem corpo de fora e despublicação em 1 clique.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Queue } from "@/lib/pipeline/queue";
import { forcedPublishStatus, startForcedPublish } from "@/lib/studio/forced-publish";
import { unpublishAuto } from "@/lib/studio/queue";
import { asUser, SEED_USERS, service } from "./studio";

const SOURCE = "c5000000-0000-4000-8000-000000000001"; // Folha do Cerrado (fixture fictícia)
const tag = randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
const items: string[] = [];
const jobs: string[] = [];

const doc = (text: string) => ({
  type: "doc",
  content: text ? [{ type: "paragraph", content: [{ type: "text", text }] }] : [],
});

async function article(key: string, over: Record<string, unknown>) {
  const id = randomUUID();
  ids[key] = id;
  const { error } = await service.from("articles").insert({
    id,
    slug: `forcado-${tag}-${key}`,
    kind: "normalized",
    section_slug: "cidade",
    title: `Forçado ${key} ${tag}`,
    dek: "Linha fina",
    body: doc("Texto da matéria que as regras seguravam para a revisão."),
    status: "in_review",
    agent_id: "write",
    ...over,
  });
  if (error) throw error;
}

function fakeQueue() {
  const enqueued: { itemRef: string; step: string }[] = [];
  return {
    enqueued,
    queue: {
      enqueue: async (_q: string, msg: { itemRef: string; step: string }) => {
        enqueued.push(msg);
        return true;
      },
    } as unknown as Queue,
  };
}

beforeAll(async () => {
  await article("ok", {});
  await article("semcorpo", { body: doc("") });
  await article("politica", { section_slug: "politica" });
  await article("jarevisada", {
    status: "published",
    publish_mode: "human",
    published_at: new Date().toISOString(),
  });
  // "ok" tem fonte (atribuição "Com informações de Folha do Cerrado").
  const item = randomUUID();
  items.push(item);
  const c = await service.from("collected_items").insert({
    id: item,
    source_id: SOURCE,
    canonical_url: `https://folhadocerrado.example/forcado-${tag}`,
    original_title: "Original fictício",
  });
  if (c.error) throw c.error;
  const s = await service
    .from("article_sources")
    .insert({ article_id: ids.ok!, item_id: item, role: "primary", confirmed: true });
  if (s.error) throw s.error;
});

afterAll(async () => {
  for (const j of jobs)
    await service.from("decisions").delete().eq("object_ref", `forced_publish:${j}`);
  if (jobs.length) await service.from("forced_publish_jobs").delete().in("id", jobs);
  await service
    .from("decisions")
    .delete()
    .in(
      "object_ref",
      Object.values(ids).map((i) => `article:${i}`),
    );
  await service.from("article_sources").delete().in("article_id", Object.values(ids));
  await service.from("collected_items").delete().in("id", items);
  await service.from("articles").delete().in("id", Object.values(ids));
});

describe("publicação forçada (banco real)", () => {
  it("editor-chefe: grava o pedido, publica em lote e atribui a fonte", async () => {
    const q = fakeQueue();
    const selection = { ids: [ids.ok!, ids.semcorpo!, ids.politica!, ids.jarevisada!] };
    const r = await asUser("marina", () => startForcedPublish(selection, { queue: () => q.queue }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    jobs.push(r.value.jobId);
    expect(r.value.total).toBe(2); // ok + politica (editor-chefe publica em tudo)
    expect(r.value.excluded.map((e) => [e.id, e.reason]).sort()).toEqual(
      [
        [ids.semcorpo, "no_body"],
        [ids.jarevisada, "status"],
      ].sort(),
    );
    expect(q.enqueued).toEqual([
      { runId: "forced", step: "forced_publish", itemRef: `forced:${r.value.jobId}:0`, attempt: 1 },
    ]);

    // Antes do worker: nada publicado.
    const before = await service.from("articles").select("status").eq("id", ids.ok!).single();
    expect(before.data?.status).toBe("in_review");

    // O worker roda o lote (e uma repetição da mensagem não conta duas vezes).
    const run = await service.rpc("forced_publish_batch", { p_job: r.value.jobId, p_batch: 0 });
    expect(run.error).toBeNull();
    expect(run.data).toMatchObject({ status: "ok", done: 2 });
    const again = await service.rpc("forced_publish_batch", { p_job: r.value.jobId, p_batch: 0 });
    expect(again.data).toMatchObject({ status: "already", done: 0 });

    const ok = await service
      .from("articles")
      .select("status, publish_mode, body")
      .eq("id", ids.ok!)
      .single();
    expect(ok.data).toMatchObject({ status: "published", publish_mode: "auto" });
    expect(JSON.stringify(ok.data?.body)).toContain("Com informações de Folha do Cerrado.");
    // Publicar não edita o texto: a versão não é humana (a decisão humana fica em `decisions`),
    // então o pipeline ainda pode reescrever a matéria se ela voltar para revisão (A-123).
    const versions = await service
      .from("article_versions")
      .select("origin")
      .eq("article_id", ids.ok!);
    expect(versions.data?.map((v) => v.origin)).not.toContain("human");
    const skipped = await service
      .from("articles")
      .select("status")
      .eq("id", ids.semcorpo!)
      .single();
    expect(skipped.data?.status).toBe("in_review");

    const dec = await service
      .from("decisions")
      .select("human_decision, human_id, output")
      .eq("object_ref", `article:${ids.ok}`)
      .eq("human_decision", "forced_publish");
    expect(dec.data).toHaveLength(1);
    expect(dec.data?.[0]?.human_id).toBe(SEED_USERS.marina.id);
    const jobDecision = await service
      .from("decisions")
      .select("human_decision, human_id, output")
      .eq("object_ref", `forced_publish:${r.value.jobId}`);
    expect(jobDecision.data?.[0]).toMatchObject({
      human_decision: "forced_publish",
      human_id: SEED_USERS.marina.id,
    });
    const audit = await service
      .from("audit_log")
      .select("actor, details")
      .eq("action", "article.force_publish")
      .eq("object_ref", `forced_publish:${r.value.jobId}`);
    expect(audit.data?.[0]?.actor).toBe(SEED_USERS.marina.id);
    expect(audit.data?.[0]?.details).toMatchObject({ total: 2, excluded: 2, batches: 1 });

    const st = await asUser("marina", () => forcedPublishStatus(r.value.jobId));
    expect(st).toMatchObject({ ok: true, value: { status: "done", total: 2, done: 2, failed: 0 } });

    // Desfazer em 1 clique: a publicada forçada é despublicável como as automáticas.
    const undo = await asUser("marina", () =>
      unpublishAuto({ id: ids.ok!, reason: "Teste de desfazer" }),
    );
    expect(undo.ok).toBe(true);
  });

  it("editor de Cidade não publica Política: fica de fora do pedido", async () => {
    await service
      .from("articles")
      .update({ status: "in_review", publish_mode: null })
      .eq("id", ids.politica!);
    const q = fakeQueue();
    const r = await asUser("otavio", () =>
      startForcedPublish({ ids: [ids.politica!] }, { queue: () => q.queue }),
    );
    expect(r).toMatchObject({ ok: false, error: "invalid" });
    expect(q.enqueued).toEqual([]);
  });

  it("jornalista não pode", async () => {
    const r = await asUser("juliana", () =>
      startForcedPublish({ ids: [ids.ok!] }, { queue: () => fakeQueue().queue }),
    );
    expect(r).toMatchObject({ ok: false, error: "forbidden" });
  });

  it("o banco recusa a ação de auditoria desconhecida e conhece a nova", async () => {
    const { data } = await service.rpc("studio_audit_actions");
    expect(data).toContain("article.force_publish");
  });
});
