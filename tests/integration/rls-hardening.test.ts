// @vitest-environment node
// Endurecimento da RLS (revisão do gate P0): coleções, correções, mídia por editoria e funções
// auxiliares fora do alcance de anon.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

const SEED_PASSWORD = "citynews-local-123";
const JULIANA = "c1000000-0000-4000-8000-000000000004"; // jornalista, aqui como leitora dona da coleção
const run = Date.now();

function client(): DbClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function as(email: string): Promise<DbClient> {
  const c = client();
  const r = await c.auth.signInWithPassword({ email, password: SEED_PASSWORD });
  if (r.error) throw r.error;
  return c;
}

const service = createServiceClient();
let readerCollection = "";
let editorialCollection = "";
let cidadeArticle = "";
let politicaArticle = "";
const media: string[] = [];
const corrections: string[] = [];

beforeAll(async () => {
  const col = await service
    .from("collections")
    .insert({
      slug: `leitura-juliana-${run}`,
      title: "Minha lista",
      description: "Coleção pessoal",
      owner_ref: JULIANA,
      is_editorial: false,
    })
    .select("id")
    .single();
  readerCollection = col.data!.id;
  const ed = await service
    .from("collections")
    .select("id")
    .eq("is_editorial", true)
    .limit(1)
    .single();
  editorialCollection = ed.data!.id;
  const arts = await service
    .from("articles")
    .select("id, section_slug")
    .in("slug", [
      "moradores-do-porto-pedem-mais-sombra-na-orla",
      "camara-aprova-revisao-do-plano-diretor-de-cuiaba",
    ]);
  cidadeArticle = arts.data!.find((a) => a.section_slug === "cidade")!.id;
  politicaArticle = arts.data!.find((a) => a.section_slug === "politica")!.id;
});

afterAll(async () => {
  await service.from("collections").delete().eq("id", readerCollection);
  if (corrections.length > 0) await service.from("corrections").delete().in("id", corrections);
  if (media.length > 0) {
    await service.from("article_media").delete().in("media_id", media);
    await service.from("media_assets").delete().in("id", media);
  }
});

describe("coleções", () => {
  it("editor não altera coleção de leitor nem os itens dela", async () => {
    const otavio = await as("otavio.reis@citynews.local");
    const upd = await otavio
      .from("collections")
      .update({ title: "Sequestrada" })
      .eq("id", readerCollection)
      .select("id");
    expect(upd.data ?? []).toHaveLength(0);
    const item = await otavio
      .from("collection_items")
      .insert({ collection_id: readerCollection, content_ref: "article:x", position: 1 })
      .select();
    expect(item.error).not.toBeNull();
    const del = await otavio.from("collections").delete().eq("id", readerCollection).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const row = await service
      .from("collections")
      .select("title")
      .eq("id", readerCollection)
      .single();
    expect(row.data?.title).toBe("Minha lista");
  });

  it("editor segue editando coleção editorial", async () => {
    const otavio = await as("otavio.reis@citynews.local");
    const upd = await otavio
      .from("collections")
      .update({ is_editorial: true })
      .eq("id", editorialCollection)
      .select("id");
    expect(upd.data).toHaveLength(1);
  });

  it("dono edita a própria coleção e os itens, sem torná-la editorial", async () => {
    const juliana = await as("juliana.campos@citynews.local");
    const upd = await juliana
      .from("collections")
      .update({ title: "Minha lista 2" })
      .eq("id", readerCollection)
      .select("id");
    expect(upd.data).toHaveLength(1);
    const item = await juliana
      .from("collection_items")
      .insert({ collection_id: readerCollection, content_ref: "article:y", position: 1 })
      .select();
    expect(item.error).toBeNull();
    const promote = await juliana
      .from("collections")
      .update({ is_editorial: true })
      .eq("id", readerCollection)
      .select();
    expect(promote.error).not.toBeNull();
    const intoEditorial = await juliana
      .from("collection_items")
      .insert({ collection_id: editorialCollection, content_ref: "article:z", position: 9 })
      .select();
    expect(intoEditorial.error).not.toBeNull();
  });
});

describe("correções", () => {
  async function correction(published: boolean) {
    const r = await service
      .from("corrections")
      .insert({
        article_id: cidadeArticle,
        kind: "fato",
        public_note: "Horário corrigido.",
        requested_by: "teste",
        published_at: published ? new Date().toISOString() : null,
      })
      .select("id")
      .single();
    corrections.push(r.data!.id);
    return r.data!.id;
  }

  it("correção publicada não é apagada nem despublicada", async () => {
    const beatriz = await as("beatriz.lemos@citynews.local");
    const id = await correction(true);
    const del = await beatriz.from("corrections").delete().eq("id", id).select("id");
    expect(del.data ?? []).toHaveLength(0);
    const unpublish = await beatriz
      .from("corrections")
      .update({ published_at: null })
      .eq("id", id)
      .select();
    expect(unpublish.error).not.toBeNull();
    const row = await service.from("corrections").select("published_at").eq("id", id).single();
    expect(row.data?.published_at).not.toBeNull();
  });

  it("correção ainda não publicada pode ser apagada", async () => {
    const beatriz = await as("beatriz.lemos@citynews.local");
    const id = await correction(false);
    const del = await beatriz.from("corrections").delete().eq("id", id).select("id");
    expect(del.data).toHaveLength(1);
  });
});

describe("mídia por editoria", () => {
  async function pendingMediaFor(article: string) {
    const m = await service
      .from("media_assets")
      .insert({
        kind: "original",
        storage_path: `teste/${run}-${media.length}.jpg`,
        license: "própria",
        allowed_use: "editorial",
        status: "pending",
      })
      .select("id")
      .single();
    media.push(m.data!.id);
    await service.from("article_media").insert({
      article_id: article,
      media_id: m.data!.id,
      rationale: "teste",
      chosen_by: "teste",
    });
    return m.data!.id;
  }

  it("editor aprova mídia só de matéria da editoria dele", async () => {
    const otavio = await as("otavio.reis@citynews.local");
    const outside = await pendingMediaFor(politicaArticle);
    const inside = await pendingMediaFor(cidadeArticle);
    const no = await otavio
      .from("media_assets")
      .update({ status: "approved" })
      .eq("id", outside)
      .select("id");
    expect(no.data ?? []).toHaveLength(0);
    const yes = await otavio
      .from("media_assets")
      .update({ status: "approved" })
      .eq("id", inside)
      .select("id");
    expect(yes.data).toHaveLength(1);
  });
});

describe("funções auxiliares", () => {
  it("anon não executa has_role nem is_staff", async () => {
    const anon = client();
    const a = await anon.rpc("has_role", {
      uid: "c1000000-0000-4000-8000-000000000001",
      role: "admin",
    });
    expect(a.error).not.toBeNull();
    const b = await anon.rpc("is_staff", { uid: "c1000000-0000-4000-8000-000000000001" });
    expect(b.error).not.toBeNull();
  });

  it("anon continua lendo matéria publicada e as tabelas filhas públicas", async () => {
    const anon = client();
    const articles = await anon.from("articles").select("id").eq("status", "published");
    expect(articles.error).toBeNull();
    expect(articles.data?.length).toBeGreaterThan(0);
    const versions = await anon.from("article_versions").select("id");
    expect(versions.error).toBeNull();
    expect(versions.data?.length).toBeGreaterThan(0);
    const sources = await anon.from("article_sources").select("article_id");
    expect(sources.error).toBeNull();
    expect(sources.data?.length).toBeGreaterThan(0);
    const am = await anon.from("article_media").select("article_id");
    expect(am.error).toBeNull();
  });
});
