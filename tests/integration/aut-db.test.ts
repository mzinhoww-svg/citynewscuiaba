// @vitest-environment node
// Autonomia de publicação (AUT-T1 a T4): colunas, funções e gatilhos novos no banco local.
// Migrations 0070 em diante.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { resetBreakerCommand, setBreakerLimitsCommand } from "@/lib/studio/switches";
import { asUser, clientOf } from "./studio";

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
      neighborhood: "Goiabeiras",
      locality: "cuiaba",
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

describe("AUT-T3 · escopo regional", () => {
  it("o contexto de decisão traz bairros, municípios, localidades da fonte e comoção", async () => {
    const id = await scenario({ sourceTrusted: true });
    const ctx = (await service.rpc("pipeline_decision_context", { p_article: id })).data as {
      neighborhoods: string[];
      municipalities: string[];
      sourceLocalities: string[];
      nationalCommotion: boolean;
    };
    expect(ctx.neighborhoods).toEqual(["Goiabeiras"]);
    expect(ctx.municipalities).toEqual(["cuiaba"]);
    expect(ctx.sourceLocalities.length).toBeGreaterThan(0);
    expect(ctx.nationalCommotion).toBe(false);
  });

  it("articles.news_scope aceita cuiaba, mt e national e recusa outro valor", async () => {
    const id = await scenario({ sourceTrusted: true });
    for (const v of ["cuiaba", "mt", "national"]) {
      const r = await service.from("articles").update({ news_scope: v }).eq("id", id);
      expect(r.error).toBeNull();
    }
    const bad = await service.from("articles").update({ news_scope: "mundo" }).eq("id", id);
    expect(bad.error).not.toBeNull();
    const flag = await service
      .from("articles")
      .update({ national_commotion: true })
      .eq("id", id)
      .select("national_commotion")
      .single();
    expect(flag.data?.national_commotion).toBe(true);
  });
});

type Counts = {
  publishedLastHour: number;
  publishedToday: number;
  reportsLastHour: number;
  limits: { hourly: number; daily: number; reportsPerHour: number; aiFailuresPerHour: number };
  trippedAt: string | null;
};
const counts = async (): Promise<Counts> =>
  (await service.rpc("publish_counts", { p_now: new Date().toISOString() })).data as Counts;

describe("AUT-T4 · disjuntor e matéria curta", () => {
  it("articles.short_reason aceita insufficient_source e recusa outro valor", async () => {
    const id = await scenario({ sourceTrusted: true });
    const ok = await service
      .from("articles")
      .update({ short_reason: "insufficient_source" })
      .eq("id", id);
    expect(ok.error).toBeNull();
    const bad = await service.from("articles").update({ short_reason: "outro" }).eq("id", id);
    expect(bad.error).not.toBeNull();
  });

  it("publish_counts conta só publicação automática e respeita o reset manual", async () => {
    const admin = await clientOf("helena");
    expect(
      (await admin.rpc("publish_breaker_reset", { p_ctx: { reason: "teste" } })).error,
    ).toBeNull();
    const base = await counts();
    expect(base).toMatchObject({
      publishedLastHour: 0,
      publishedToday: 0,
      trippedAt: null,
      // A-126: limites do dono (migration 0186).
      limits: { hourly: 300, daily: 3000 },
    });

    const a = await scenario({ sourceTrusted: true });
    const b = await scenario({ sourceTrusted: true });
    const now = new Date().toISOString();
    await service
      .from("articles")
      .update({ status: "published", publish_mode: "auto", published_at: now })
      .eq("id", a);
    await service
      .from("articles")
      .update({ status: "published", publish_mode: "human", published_at: now })
      .eq("id", b);
    const after = await counts();
    expect(after.publishedLastHour).toBe(1);
    expect(after.publishedToday).toBe(1);

    const sem = await service.rpc("publish_counts", {
      p_now: new Date(Date.now() + 3 * 3_600_000).toISOString(),
    });
    expect((sem.data as Counts).publishedLastHour).toBe(0);
  });

  it("trip desliga auto_publish uma única vez, audita; reset de admin fecha e zera a janela", async () => {
    await service.from("feature_flags").update({ enabled: true }).eq("key", "auto_publish");
    const first = await service.rpc("publish_breaker_trip", {
      p_reason: "hourly",
      p_detail: { n: 61 },
    });
    expect(first.data).toBe(true);
    const flag = await service
      .from("feature_flags")
      .select("enabled")
      .eq("key", "auto_publish")
      .single();
    expect(flag.data?.enabled).toBe(false);
    expect((await counts()).trippedAt).not.toBeNull();
    const second = await service.rpc("publish_breaker_trip", { p_reason: "daily", p_detail: {} });
    expect(second.data).toBe(false);
    const audit = await service
      .from("audit_log")
      .select("action, details")
      .eq("action", "breaker.trip")
      .order("id", { ascending: false })
      .limit(1);
    expect(audit.data?.[0]?.details).toMatchObject({ reason: "hourly" });

    const bad = await service.rpc("publish_breaker_trip", { p_reason: "tédio" });
    expect(bad.error).not.toBeNull();

    const editor = await clientOf("otavio");
    expect((await editor.rpc("publish_breaker_reset", {})).error).not.toBeNull();
    const admin = await clientOf("helena");
    expect((await admin.rpc("publish_breaker_reset", {})).error).toBeNull();
    const after = await counts();
    expect(after.trippedAt).toBeNull();
    expect(after.publishedLastHour).toBe(0);
  });

  it("limites editáveis só por admin, com auditoria", async () => {
    const admin = await clientOf("helena");
    const set = await admin.rpc("publish_breaker_set_limits", {
      p: { hourly: 90, daily: 1200 },
      p_ctx: { reason: "pico esperado" },
    });
    expect(set.error).toBeNull();
    expect((await counts()).limits).toMatchObject({ hourly: 90, daily: 1200 });
    const editor = await clientOf("otavio");
    expect(
      (await editor.rpc("publish_breaker_set_limits", { p: { hourly: 5 } })).error,
    ).not.toBeNull();
    const bad = await admin.rpc("publish_breaker_set_limits", { p: { hourly: 0 } });
    expect(bad.error).not.toBeNull();
    await admin.rpc("publish_breaker_set_limits", { p: { hourly: 300, daily: 3000 } });
    expect((await counts()).limits).toMatchObject({ hourly: 300, daily: 3000 });
  });
});

describe("AUT-T4 · comandos do Estúdio para o disjuntor", () => {
  it("admin edita limites e faz o reset; editor é recusado", async () => {
    const set = await asUser("helena", () =>
      setBreakerLimitsCommand({ hourly: 70, reason: "pico de campanha" }),
    );
    expect(set).toMatchObject({ ok: true });
    expect((await counts()).limits.hourly).toBe(70);
    const denied = await asUser("otavio", () =>
      setBreakerLimitsCommand({ hourly: 5, reason: "tentativa" }),
    );
    expect(denied).toMatchObject({ ok: false });
    expect((await counts()).limits.hourly).toBe(70);
    expect(
      await asUser("helena", () => resetBreakerCommand({ reason: "incidente resolvido" })),
    ).toMatchObject({ ok: true });
    await asUser("helena", () =>
      setBreakerLimitsCommand({ hourly: 300, reason: "volta ao padrão" }),
    );
    // A-126: o padrão é 300 por hora (migration 0186).
    expect((await counts()).limits.hourly).toBe(300);
  });
});
