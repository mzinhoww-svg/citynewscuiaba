// @vitest-environment node
// Autonomia de publicação (AUT-T1 a T4): colunas, funções e gatilhos novos no banco local.
// Migrations 0070 em diante.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";

const service = createServiceClient();
const tag = randomUUID().slice(0, 8);
const topics: string[] = [];
const articles: string[] = [];
const items: string[] = [];
const touched: { id: string; trusted: boolean }[] = [];

afterAll(async () => {
  if (articles.length) {
    await service.from("article_sources").delete().in("article_id", articles);
    await service
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        articles.map((a) => `article:${a}`),
      );
    await service.from("articles").delete().in("id", articles);
  }
  if (items.length) await service.from("collected_items").delete().in("id", items);
  if (topics.length) {
    await service
      .from("decisions")
      .delete()
      .in(
        "object_ref",
        topics.map((t) => `topic:${t}`),
      );
    await service.from("topics").delete().in("id", topics);
  }
  for (const s of touched)
    await service.from("sources").update({ trusted: s.trusted }).eq("id", s.id);
});

async function scenario(opts: { sourceTrusted: boolean; verify?: { [k: string]: boolean } }) {
  const { data: src } = await service
    .from("sources")
    .select("id, trusted")
    .eq("slug", "mt-agora")
    .single();
  if (!src) throw new Error("fonte mt-agora ausente no seed");
  touched.push({ id: src.id, trusted: src.trusted });
  await service.from("sources").update({ trusted: opts.sourceTrusted }).eq("id", src.id);

  const topic = await service
    .from("topics")
    .insert({ slug: `aut-${tag}-${topics.length}`, title: "Assunto de teste AUT" })
    .select("id")
    .single();
  if (topic.error) throw new Error(topic.error.message);
  topics.push(topic.data.id);

  const item = await service
    .from("collected_items")
    .insert({
      source_id: src.id,
      canonical_url: `https://mtagora.example/aut-${tag}-${items.length}`,
      original_title: "Polícia prende suspeito em Cuiabá",
      topic_id: topic.data.id,
      sensitive: true,
      tags: ["crime"],
    })
    .select("id")
    .single();
  if (item.error) throw new Error(item.error.message);
  items.push(item.data.id);

  const article = await service
    .from("articles")
    .insert({
      slug: `aut-${tag}-${articles.length}`,
      kind: "normalized",
      topic_id: topic.data.id,
      section_slug: "seguranca",
      title: "Polícia prende suspeito em Cuiabá",
      dek: "Prisão ocorreu na região central.",
      body: { type: "doc", content: [] },
      status: "draft",
      agent_id: "write",
    })
    .select("id")
    .single();
  if (article.error) throw new Error(article.error.message);
  articles.push(article.data.id);
  const link = await service
    .from("article_sources")
    .insert({ article_id: article.data.id, item_id: item.data.id, role: "primary" });
  if (link.error) throw new Error(link.error.message);

  if (opts.verify) {
    const d = await service.from("decisions").insert({
      object_ref: `topic:${topic.data.id}`,
      step: "verify",
      output: opts.verify,
    });
    if (d.error) throw new Error(d.error.message);
  }
  return article.data.id;
}

describe("AUT-T2 · sources.trusted", () => {
  it("toda fonte tem a coluna trusted (backfill da migration 0071)", async () => {
    const { data } = await service.from("sources").select("slug, trusted");
    expect((data ?? []).length).toBeGreaterThan(0);
    expect((data ?? []).every((r) => typeof r.trusted === "boolean")).toBe(true);
  });

  it("o contexto de decisão expõe sourceTrusted e dubious", async () => {
    const trusted = await scenario({ sourceTrusted: true, verify: { dubious: true } });
    const ctx = (await service.rpc("pipeline_decision_context", { p_article: trusted })).data as {
      sourceTrusted: boolean;
      dubious: boolean;
      centralConflict: boolean;
    };
    expect(ctx).toMatchObject({ sourceTrusted: true, dubious: true, centralConflict: false });

    const weak = await scenario({ sourceTrusted: false, verify: { centralConflict: true } });
    const ctx2 = (await service.rpc("pipeline_decision_context", { p_article: weak })).data as {
      sourceTrusted: boolean;
      dubious: boolean;
      centralConflict: boolean;
    };
    expect(ctx2).toMatchObject({ sourceTrusted: false, dubious: false, centralConflict: true });
  });
});

describe("AUT-T1 · segurança publicada automaticamente", () => {
  it("abre o assunto (gatilho sem trava D12)", async () => {
    const id = await scenario({ sourceTrusted: true });
    const topicId = topics.at(-1)!;
    await service
      .from("articles")
      .update({ status: "published", publish_mode: "auto", published_at: new Date().toISOString() })
      .eq("id", id);
    const t = await service.from("topics").select("visibility").eq("id", topicId).single();
    expect(t.data?.visibility).toBe("public");
  });
});
