// @vitest-environment node
// Revisão P1/P3-GATE (ALTA 2): assunto criado pelo pipeline nasce interno, com título provisório
// próprio; só vira público (RLS, listas e sitemap) quando uma matéria dele é publicada, e nunca
// para Segurança ou urgente sem revisão humana (D12).
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import { listTopicEntries } from "@/lib/db/queries/seo";
import { getTopicBySlug, listTopics } from "@/lib/db/queries";
import type { Database } from "@/lib/db/types";

const service = createServiceClient();
const topics: string[] = [];
const articles: string[] = [];

function client(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function editor(): Promise<DbClient> {
  const c = client();
  const r = await c.auth.signInWithPassword({
    email: "marina.arruda@citynews.local",
    password: "citynews-local-123",
  });
  if (r.error) throw r.error;
  return c;
}

async function internalTopic(section: string | null = null) {
  const tag = randomUUID().replace(/-/g, "").slice(0, 8);
  const { data, error } = await service
    .from("topics")
    .insert({ slug: `apuracao-${tag}`, title: "Assunto em apuração", section_slug: section })
    .select("id, slug, title, visibility")
    .single();
  if (error || !data) throw new Error(error?.message);
  topics.push(data.id);
  return data;
}

async function article(
  topicId: string,
  over: Partial<Database["public"]["Tables"]["articles"]["Insert"]> = {},
) {
  const tag = randomUUID().slice(0, 8);
  const { data, error } = await service
    .from("articles")
    .insert({
      slug: `teste-visibilidade-${tag}`,
      kind: "normalized",
      topic_id: topicId,
      section_slug: "servicos",
      title: `Farmácias de plantão atendem no fim de semana ${tag}`,
      dek: "Lista oficial com 12 unidades abertas.",
      body: { type: "doc", content: [] },
      status: "draft",
      agent_id: "teste",
      ...over,
    })
    .select("id, title")
    .single();
  if (error || !data) throw new Error(error?.message);
  articles.push(data.id);
  return data;
}

const publish = (id: string, mode: "auto" | "human") =>
  service
    .from("articles")
    .update({ status: "published", publish_mode: mode, published_at: new Date().toISOString() })
    .eq("id", id);

const readTopic = async (id: string) =>
  (await service.from("topics").select("slug, title, visibility").eq("id", id).single()).data!;

afterAll(async () => {
  if (articles.length) await service.from("articles").delete().in("id", articles);
  if (topics.length) await service.from("topics").delete().in("id", topics);
});

describe("visibilidade dos assuntos", () => {
  it("interno: anon não lê; redação lê; título provisório ganha a editoria", async () => {
    const t = await internalTopic();
    expect(t.visibility).toBe("internal");
    expect((await client().from("topics").select("id").eq("id", t.id)).data).toEqual([]);
    expect((await (await editor()).from("topics").select("id").eq("id", t.id)).data).toHaveLength(
      1,
    );
    await service.from("topics").update({ section_slug: "saude" }).eq("id", t.id);
    expect((await readTopic(t.id)).title).toBe("Assunto em apuração · Saúde");
  });

  it("público sem matéria publicada também não aparece para anon", async () => {
    const t = await internalTopic();
    await service.from("topics").update({ visibility: "public" }).eq("id", t.id);
    expect((await client().from("topics").select("id").eq("id", t.id)).data).toEqual([]);
  });

  it("matéria publicada torna o assunto público com título e slug próprios", async () => {
    const t = await internalTopic("servicos");
    const a = await article(t.id);
    await publish(a.id, "auto");
    const after = await readTopic(t.id);
    expect(after.visibility).toBe("public");
    expect(after.title).toBe(a.title);
    expect(after.slug).toMatch(/^farmacias-de-plantao-atendem-no-fim-de-semana-/);
    expect((await client().from("topics").select("id").eq("id", t.id)).data).toHaveLength(1);

    const detail = await getTopicBySlug(after.slug);
    expect(detail.ok && detail.value?.title).toBe(a.title);
    const list = await listTopics({});
    expect(list.ok && list.value.some((x) => x.id === t.id)).toBe(true);
    const sitemap = await listTopicEntries();
    expect(sitemap.ok && sitemap.value.some((e) => e.path.endsWith(after.slug))).toBe(true);
  });

  it("Segurança ou urgente publicado automaticamente abre o assunto (A2/A4, regras v3)", async () => {
    const seg = await internalTopic("seguranca");
    const a = await article(seg.id, { section_slug: "seguranca" });
    await publish(a.id, "auto");
    expect((await readTopic(seg.id)).visibility).toBe("public");

    const urg = await internalTopic("cidade");
    const b = await article(urg.id, { section_slug: "cidade", urgent: true });
    await publish(b.id, "auto");
    expect((await readTopic(urg.id)).visibility).toBe("public");
  });

  it("interno fica fora de lista, página e sitemap", async () => {
    const t = await internalTopic("cidade");
    await article(t.id); // rascunho: não publica
    expect((await getTopicBySlug(t.slug)).ok && (await getTopicBySlug(t.slug))).toMatchObject({
      ok: true,
      value: null,
    });
    const list = await listTopics({});
    expect(list.ok && list.value.some((x) => x.id === t.id)).toBe(false);
    const sitemap = await listTopicEntries();
    expect(sitemap.ok && sitemap.value.some((e) => e.path.endsWith(t.slug))).toBe(false);
  });
});
