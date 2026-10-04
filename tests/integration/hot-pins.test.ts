// @vitest-environment node
// HOT-T3 (0156): pauta quente vira destaque com banco real. O pino quente nunca impede o admin de
// fixar (capacidade por tipo), `featured_dismiss_hot` exige o papel dos destaques e encerra os
// pinos quentes do assunto, e `applyHotPins` com o repositório de produção grava só pinos `hot`.
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { createHotPinRepo } from "@/lib/db/hot-pin-store";
import { applyHotPins } from "@/lib/featured/hot-pin";
import { clientOf } from "./studio";

const db = createServiceClient();
const tag = randomUUID().slice(0, 8);
const created = {
  articles: [] as string[],
  media: [] as string[],
  topics: [] as string[],
  signals: [] as string[],
};

async function topic(name: string): Promise<string> {
  const id = randomUUID();
  const r = await db.from("topics").insert({
    id,
    slug: `hot-${tag}-${name}`,
    title: `Assunto quente ${name} ${tag}`,
    summary: "Resumo de teste",
    state: "em_apuracao",
  });
  if (r.error) throw r.error;
  created.topics.push(id);
  return id;
}

async function article(name: string, topicId: string | null): Promise<string> {
  const id = randomUUID();
  const r = await db.from("articles").insert({
    id,
    slug: `hot-${tag}-${name}`,
    kind: "original",
    section_slug: "cidade",
    title: `Pauta quente ${name} ${tag}`,
    dek: "Linha fina",
    body: { type: "doc", content: [] },
    status: "published",
    published_at: new Date().toISOString(),
    news_scope: "cuiaba",
    confidence_score: 0.8,
    topic_id: topicId,
  });
  if (r.error) throw r.error;
  created.articles.push(id);
  const m = await db
    .from("media_assets")
    .insert({
      kind: "original",
      storage_path: `hot/${tag}-${name}.jpg`,
      license: "própria",
      allowed_use: "editorial",
      status: "approved",
    })
    .select("id")
    .single();
  if (m.error) throw m.error;
  created.media.push(m.data.id);
  const l = await db.from("article_media").insert({
    article_id: id,
    media_id: m.data.id,
    rationale: "teste",
    chosen_by: "test",
    role: "cover",
  });
  if (l.error) throw l.error;
  return id;
}

const inHours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

let hotTopic = "";
let hotArticle = "";
let manualArticle = "";

beforeAll(async () => {
  // Parte das posições vazias (as suítes de integração rodam em série).
  await db
    .from("featured_items")
    .update({ ended_at: new Date().toISOString() })
    .is("ended_at", null);
  hotTopic = await topic("um");
  hotArticle = await article("quente", hotTopic);
  manualArticle = await article("manual", null);
});

afterAll(async () => {
  await db.from("featured_items").delete().in("article_id", created.articles);
  if (created.signals.length) await db.from("front_signals").delete().in("id", created.signals);
  await db.from("featured_image_requests").delete().in("article_id", created.articles);
  await db.from("article_media").delete().in("article_id", created.articles);
  await db.from("media_assets").delete().in("id", created.media);
  await db.from("articles").delete().in("id", created.articles);
  await db.from("topics").delete().in("id", created.topics);
});

describe("pinos da pauta quente (banco real)", () => {
  it("pino quente na manchete não impede o admin de fixar (manual vence)", async () => {
    const hot = await db
      .from("featured_items")
      .insert({
        kind: "hot",
        slot_key: "explorar.topo",
        article_id: hotArticle,
        topic_id: hotTopic,
        ends_at: inHours(3),
        hot_sources: 3,
      })
      .select("id")
      .single();
    expect(hot.error).toBeNull();
    const manual = await (
      await clientOf("helena")
    ).rpc("featured_pin", {
      p_slot: "explorar.topo",
      p_section: null as never,
      p_article: manualArticle,
      p_ends_at: inHours(2),
      p_note: "",
    });
    expect(manual.error).toBeNull();
    // Um segundo quente na mesma posição de capacidade 1 continua barrado.
    const second = await db.from("featured_items").insert({
      kind: "hot",
      slot_key: "explorar.topo",
      article_id: manualArticle,
      ends_at: inHours(3),
    });
    expect(second.error?.message).toContain("featured:capacity");
    await db
      .from("featured_items")
      .update({ ended_at: new Date().toISOString() })
      .in("article_id", created.articles)
      .is("ended_at", null);
  });

  it("featured_dismiss_hot: sem papel falha; editor-chefe dispensa todos os pinos quentes do assunto", async () => {
    const rows = await db
      .from("featured_items")
      .insert([
        {
          kind: "hot",
          slot_key: "home.lead",
          article_id: hotArticle,
          topic_id: hotTopic,
          ends_at: inHours(3),
        },
        {
          kind: "hot",
          slot_key: "editoria.lead",
          section_slug: "cidade",
          article_id: hotArticle,
          topic_id: hotTopic,
          ends_at: inHours(3),
        },
      ])
      .select("id");
    expect(rows.error).toBeNull();
    const [first] = rows.data!;
    const denied = await (
      await clientOf("juliana")
    ).rpc("featured_dismiss_hot", {
      p_id: first!.id,
    });
    expect(denied.error?.code).toBe("42501");
    const ok = await (await clientOf("marina")).rpc("featured_dismiss_hot", { p_id: first!.id });
    expect(ok.error).toBeNull();
    expect(ok.data).toBe(2);
    const after = await db
      .from("featured_items")
      .select("dismissed_at, ended_at")
      .in(
        "id",
        rows.data!.map((r) => r.id),
      );
    for (const r of after.data ?? []) {
      expect(r.dismissed_at).not.toBeNull();
      expect(r.ended_at).not.toBeNull();
    }
    // Pino manual não se dispensa.
    const manual = await db
      .from("featured_items")
      .insert({ slot_key: "home.destaques", article_id: manualArticle, ends_at: inHours(1) })
      .select("id")
      .single();
    const bad = await (
      await clientOf("marina")
    ).rpc("featured_dismiss_hot", {
      p_id: manual.data!.id,
    });
    expect(bad.error?.code).toBe("P0002");
  });

  it("applyHotPins com o banco: 3 portais no topo põem a matéria na manchete e na editoria", async () => {
    // A dispensa do teste anterior vale para o sinal antigo: este assunto novo começa limpo.
    const fresh = await topic("dois");
    const art = await article("quente-2", fresh);
    const sources = await db.from("sources").select("id").limit(3);
    expect(sources.data?.length).toBe(3);
    const ins = await db
      .from("front_signals")
      .insert(
        sources.data!.map((s, i) => ({
          source_id: s.id,
          topic_id: fresh,
          url: `https://portal-${i}.example/hot-${tag}`,
          rank: 1,
        })),
      )
      .select("id");
    expect(ins.error).toBeNull();
    created.signals.push(...ins.data!.map((r) => r.id));
    await db.from("feature_flags").update({ enabled: true }).eq("key", "hot_featured_enabled");

    const deps = { repo: createHotPinRepo(db), now: () => new Date() };
    await applyHotPins(deps);
    const pins = await db
      .from("featured_items")
      .select("slot_key, section_slug, kind, hot_sources, ends_at")
      .eq("article_id", art)
      .is("ended_at", null);
    expect(pins.data?.map((p) => `${p.slot_key}:${p.section_slug ?? ""}`).sort()).toEqual([
      "editoria.lead:cidade",
      "home.lead:",
    ]);
    for (const p of pins.data ?? []) {
      expect(p.kind).toBe("hot");
      expect(p.hot_sources).toBe(3);
    }
    // Nunca muda a matéria.
    const a = await db.from("articles").select("status").eq("id", art).single();
    expect(a.data?.status).toBe("published");
    // Idempotente.
    await applyHotPins(deps);
    const again = await db
      .from("featured_items")
      .select("id")
      .eq("article_id", art)
      .is("ended_at", null);
    expect(again.data).toHaveLength(2);
  });
});
