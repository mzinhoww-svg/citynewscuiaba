// @vitest-environment node
// AUT-T6 (A11, A12): prazo da fila (`due_at`), fila do revisor (`review_due_articles`), modo do
// revisor nos Interruptores e uma passada completa com o banco real. Migration 0141.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createCallAgent } from "@/lib/ai/call-agent";
import { createFakeProvider } from "@/lib/ai/fake";
import { createMemoryAiStore } from "@/lib/ai/testing/memory-store";
import { createServiceClient } from "@/lib/db/client";
import { createReviewRepo } from "@/lib/db/review-store";
import type { PipelineMessage } from "@/lib/pipeline/types";
import { runReviewTick } from "@/lib/pipeline/steps/auto-reviewer";
import { setReviewerModeCommand } from "@/lib/studio/switches";
import { asUser, clientOf } from "./studio";

const service = createServiceClient();
const tag = randomUUID().slice(0, 8);
const articles: string[] = [];
const items: string[] = [];
const topics: string[] = [];

afterAll(async () => {
  await service.from("ai_reviewer_settings").update({ mode: "night" }).eq("id", true);
  if (articles.length) {
    const refs = articles.map((a) => `article:${a}`);
    await service.from("review_escalations").delete().in("article_id", articles);
    await service.from("reports").delete().in("content_ref", refs);
    await service.from("corrections").delete().in("article_id", articles);
    await service.from("decisions").delete().in("object_ref", refs);
    await service.from("article_versions").delete().in("article_id", articles);
    await service.from("article_sources").delete().in("article_id", articles);
    await service.from("articles").delete().in("id", articles);
  }
  if (items.length) await service.from("collected_items").delete().in("id", items);
  if (topics.length) await service.from("topics").delete().in("id", topics);
});

const BODY = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "A Prefeitura de Cuiabá anunciou a obra na avenida." }],
    },
    {
      type: "paragraph",
      attrs: { credit: true, citations: [] },
      content: [{ type: "text", text: "Com informações de MT Agora." }],
    },
  ],
};

async function make(
  over: Record<string, unknown> = {},
  opts: { source?: boolean } = { source: true },
): Promise<string> {
  const topic = await service
    .from("topics")
    .insert({ slug: `aut6-${tag}-${topics.length}`, title: "Assunto AUT6" })
    .select("id")
    .single();
  if (topic.error) throw new Error(topic.error.message);
  topics.push(topic.data.id);
  const a = await service
    .from("articles")
    .insert({
      slug: `aut6-${tag}-${articles.length}`,
      kind: "normalized",
      topic_id: topic.data.id,
      section_slug: "cidade",
      title: "Prefeitura anuncia obra na avenida",
      dek: "Obra começa na segunda-feira.",
      body: BODY,
      status: "in_review",
      agent_id: "write",
      review_reason: "Fonte única sem confirmação",
      ...over,
    })
    .select("id")
    .single();
  if (a.error) throw new Error(a.error.message);
  articles.push(a.data.id);
  if (opts.source) {
    const { data: src } = await service
      .from("sources")
      .select("id")
      .eq("slug", "mt-agora")
      .single();
    const item = await service
      .from("collected_items")
      .insert({
        source_id: src!.id,
        canonical_url: `https://mtagora.example/aut6-${tag}-${items.length}`,
        original_title: "Prefeitura anuncia obra na avenida",
        topic_id: topic.data.id,
        locality: "cuiaba",
      })
      .select("id")
      .single();
    if (item.error) throw new Error(item.error.message);
    items.push(item.data.id);
    const link = await service
      .from("article_sources")
      .insert({ article_id: a.data.id, item_id: item.data.id, role: "primary" });
    if (link.error) throw new Error(link.error.message);
  }
  return a.data.id;
}

const dueOf = async (id: string) =>
  (await service.from("articles").select("due_at").eq("id", id).single()).data?.due_at ?? null;
const minutesFromNow = (iso: string | null) =>
  iso === null ? Number.NaN : (Date.parse(iso) - Date.now()) / 60_000;

describe("articles.due_at por regra (A11)", () => {
  it("entrar em revisão preenche o prazo: urgente 10 min, demais 30 min", async () => {
    const normal = await make();
    expect(minutesFromNow(await dueOf(normal))).toBeGreaterThan(29);
    expect(minutesFromNow(await dueOf(normal))).toBeLessThanOrEqual(30.1);
    const urgent = await make({ urgent: true });
    expect(minutesFromNow(await dueOf(urgent))).toBeGreaterThan(9);
    expect(minutesFromNow(await dueOf(urgent))).toBeLessThanOrEqual(10.1);
  });

  it("rascunho que passa para revisão ganha o prazo; ficar em revisão não o renova", async () => {
    const id = await make({ status: "draft" });
    expect(await dueOf(id)).toBeNull();
    await service.from("articles").update({ status: "in_review" }).eq("id", id);
    const first = await dueOf(id);
    expect(minutesFromNow(first)).toBeGreaterThan(29);
    await service.from("articles").update({ review_reason: "Outro motivo" }).eq("id", id);
    expect(await dueOf(id)).toBe(first);
  });
});

describe("review_due_articles", () => {
  const overdue = (id: string) =>
    service
      .from("articles")
      .update({ due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);
  const listed = async (id: string) => {
    const r = await service.rpc("review_due_articles", { p_limit: 50 });
    expect(r.error).toBeNull();
    return (r.data ?? []).some((x) => x.id === id);
  };

  it("vencida do pipeline entra; ainda no prazo não", async () => {
    const late = await make();
    const early = await make();
    await overdue(late);
    expect(await listed(late)).toBe(true);
    expect(await listed(early)).toBe(false);
  });

  it("nunca rascunho sem IA (lista de trechos das fontes, migration 0148)", async () => {
    const fb = await make();
    await overdue(fb);
    expect(await listed(fb)).toBe(true);
    await service.from("articles").update({ ai_fallback: true }).eq("id", fb);
    expect(await listed(fb)).toBe(false);
  });

  it("nunca denúncia, correção, direito de resposta, escalada, edição de pessoa nem matéria sem agente", async () => {
    const rep = await make();
    await overdue(rep);
    await service
      .from("reports")
      .insert({ content_ref: `article:${rep}`, kind: "wrong_info", message: "x" });
    expect(await listed(rep)).toBe(false);

    const cor = await make();
    await overdue(cor);
    await service.from("corrections").insert({
      article_id: cor,
      kind: "correction",
      public_note: "Corrigir o número",
      requested_by: "leitor",
    });
    expect(await listed(cor)).toBe(false);

    const row = await make();
    await overdue(row);
    await service.from("corrections").insert({
      article_id: row,
      kind: "right_of_reply",
      public_note: "Resposta",
      requested_by: "x",
    });
    expect(await listed(row)).toBe(false);

    const esc = await make();
    await overdue(esc);
    await service.from("review_escalations").insert({ article_id: esc });
    expect(await listed(esc)).toBe(false);

    const human = await make();
    await overdue(human);
    await service.from("article_versions").insert({
      article_id: human,
      number: 1,
      snapshot: {},
      origin: "human",
    });
    expect(await listed(human)).toBe(false);

    const noAgent = await make({ agent_id: null });
    await overdue(noAgent);
    expect(await listed(noAgent)).toBe(false);
  });

  it("quem o revisor já segurou só volta quando a matéria mudar", async () => {
    const id = await make();
    await overdue(id);
    expect(await listed(id)).toBe(true);
    await service.from("decisions").insert({
      object_ref: `article:${id}`,
      step: "review",
      input_hash: `review:${id}`,
      output: { verdict: "hold" },
      rationale: "Mantida.",
    });
    expect(await listed(id)).toBe(false);
    await service
      .from("articles")
      .update({ review_reason: "Mudou", updated_at: new Date(Date.now() + 5000).toISOString() })
      .eq("id", id);
    expect(await listed(id)).toBe(true);
  });
});

describe("modo do revisor nos Interruptores", () => {
  it("padrão night; o agente reviewer existe com prompt em produção e R$ 1 de orçamento", async () => {
    const mode = await service.from("ai_reviewer_settings").select("mode").eq("id", true).single();
    expect(["night", "off", "always"]).toContain(mode.data?.mode);
    const agent = await service
      .from("ai_agents")
      .select("id, daily_budget_brl")
      .eq("id", "reviewer")
      .single();
    expect(Number(agent.data?.daily_budget_brl)).toBe(1);
    const prompt = await service
      .from("ai_prompts")
      .select("status")
      .eq("agent_id", "reviewer")
      .eq("version", 1)
      .single();
    expect(prompt.data?.status).toBe("production");
  });

  it("admin muda o modo com motivo e fica na auditoria; modo inválido e outros papéis são recusados", async () => {
    const r = await asUser("helena", () =>
      setReviewerModeCommand({ mode: "always", reason: "Cobertura de plantão" }),
    );
    expect(r.ok).toBe(true);
    const now = await service.from("ai_reviewer_settings").select("mode").eq("id", true).single();
    expect(now.data?.mode).toBe("always");
    const audit = await service
      .from("audit_log")
      .select("details")
      .eq("object_ref", "flag:ai_reviewer")
      .order("id", { ascending: false })
      .limit(4);
    // A função do banco grava de/para; a Server Action grava o modo e o motivo.
    const rows = (audit.data ?? []).map((a) => a.details);
    expect(rows).toContainEqual(expect.objectContaining({ to: "always" }));
    expect(rows).toContainEqual(
      expect.objectContaining({ mode: "always", reason: "Cobertura de plantão" }),
    );

    const denied = await asUser("marina", () =>
      setReviewerModeCommand({ mode: "off", reason: "tentativa" }),
    );
    expect(denied.ok).toBe(false);
    const db = await clientOf("helena");
    const bad = await db.rpc("ai_reviewer_set_mode", { p_mode: "talvez" });
    expect(bad.error?.code).toBe("22023");
    expect(
      (await service.from("ai_reviewer_settings").select("mode").eq("id", true).single()).data
        ?.mode,
    ).toBe("always");
    const empty = await asUser("helena", () =>
      setReviewerModeCommand({ mode: "off", reason: " " }),
    );
    expect(empty.ok).toBe(false);
  });
});

describe("passada completa do revisor no banco", () => {
  async function tick(
    only: string,
    script: unknown[],
    mode: "off" | "night" | "always",
    now = new Date("2026-10-03T18:00:00Z"),
  ) {
    await service.from("ai_reviewer_settings").update({ mode }).eq("id", true);
    const fake = createFakeProvider();
    fake.script(script as never);
    const callAgent = createCallAgent({
      store: createMemoryAiStore(),
      provider: fake,
      now: () => now,
    });
    const queued: PipelineMessage[] = [];
    const tags: string[][] = [];
    const result = await runReviewTick({
      // Só a matéria do teste: o banco compartilhado pode ter outras vencidas.
      repo: { ...createReviewRepo(service), dueArticles: async () => [only] },
      flags: { isEnabled: async (k) => k === "auto_publish" },
      callAgent,
      promptVersion: async () => 1,
      queue: {
        enqueue: async (_q, m) => {
          queued.push(m);
          return true;
        },
      },
      revalidate: async (t) => {
        tags.push(t);
      },
      now: () => now,
      batch: 50,
    });
    return { result, queued, tags, fake };
  }
  const state = async (id: string) =>
    (
      await service
        .from("articles")
        .select("status, publish_mode, review_reason, short_reason")
        .eq("id", id)
        .single()
    ).data;
  const overdue = (id: string) =>
    service
      .from("articles")
      .update({ due_at: new Date(Date.now() - 60_000).toISOString() })
      .eq("id", id);

  it("publicar: matéria no ar com a justificativa em decisions e índice e aviso na fila", async () => {
    const id = await make();
    await overdue(id);
    const { result, queued, tags } = await tick(
      id,
      [
        {
          output: { verdict: "publish", reason: "Texto claro, atribuído e útil ao leitor local." },
        },
      ],
      "always",
    );
    expect(result).toMatchObject({ status: "ran", published: expect.any(Number) });
    expect(await state(id)).toMatchObject({
      status: "published",
      publish_mode: "auto",
      review_reason: null,
    });
    const d = await service
      .from("decisions")
      .select("step, agent_id, recommended, rationale, output")
      .eq("object_ref", `article:${id}`)
      .eq("step", "review")
      .single();
    expect(d.data).toMatchObject({
      agent_id: "reviewer",
      recommended: "publish",
      rationale: "Texto claro, atribuído e útil ao leitor local.",
    });
    expect(queued.map((m) => `${m.step}:${m.itemRef}`)).toContain(`index:article:${id}`);
    expect(tags.flat()).toContain(`article:${id}`);
  });

  it("manter: segue em revisão com o motivo e não volta à fila até mudar", async () => {
    const id = await make();
    await overdue(id);
    const { result } = await tick(
      id,
      [{ output: { verdict: "hold", reason: "A fonte é única e o número não é confirmável." } }],
      "always",
    );
    expect(result).toMatchObject({ status: "ran", held: 1 });
    const s = await state(id);
    expect(s?.status).toBe("in_review");
    expect(s?.review_reason).toContain("número");
    const again = await service.rpc("review_due_articles", { p_limit: 50 });
    expect((again.data ?? []).some((x) => x.id === id)).toBe(false);
  });

  it("arquivar pelo conteúdo arquiva; por prazo vira manter", async () => {
    const a = await make();
    await overdue(a);
    await tick(
      a,
      [{ output: { verdict: "archive", reason: "Repete matéria já publicada sobre a obra." } }],
      "always",
    );
    expect((await state(a))?.status).toBe("archived");

    const b = await make();
    await overdue(b);
    await tick(
      b,
      [{ output: { verdict: "archive", reason: "Prazo de revisão vencido, matéria expirou." } }],
      "always",
    );
    expect((await state(b))?.status).toBe("in_review");
  });

  it("de dia no modo night e com o modo off, nada muda", async () => {
    const id = await make();
    await overdue(id);
    const day = await tick(id, [], "night", new Date("2026-10-03T18:00:00Z"));
    expect(day.result).toEqual({ status: "inactive", mode: "night" });
    const off = await tick(id, [], "off", new Date("2026-10-04T02:00:00Z"));
    expect(off.result).toEqual({ status: "inactive", mode: "off" });
    expect((await state(id))?.status).toBe("in_review");
  });

  it("publicar sem fonte vira manter (mesmos portões da publicação)", async () => {
    const id = await make({}, { source: false });
    await overdue(id);
    await tick(
      id,
      [{ output: { verdict: "publish", reason: "Texto claro e útil ao leitor." } }],
      "always",
    );
    const s = await state(id);
    expect(s?.status).toBe("in_review");
    expect(s?.review_reason).toMatch(/fonte/i);
  });
});
