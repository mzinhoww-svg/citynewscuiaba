// @vitest-environment node
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";
import { DEFAULT_RULES } from "@/lib/rules/defaults";

const SEED_PASSWORD = "citynews-local-123";

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

describe("banco local com seed fictício", () => {
  it("seed tem 12 fontes fictícias e nenhuma real", async () => {
    const db = createServiceClient();
    const { data } = await db.from("sources").select("name");
    expect(data).toHaveLength(12);
    expect(data!.map((s) => s.name)).toContain("Folha do Cerrado");
    expect(data!.map((s) => s.name)).not.toContain("Midia News");
    expect(data!.map((s) => s.name)).not.toContain("MidiaNews");
  });

  it("audit_log é somente inserção", async () => {
    const db = createServiceClient();
    await db.from("audit_log").insert({ actor: "teste", action: "x", object_ref: "y" });
    const { error } = await db.from("audit_log").delete().eq("actor", "teste");
    expect(error?.message).toContain("somente inserção");
  });

  it("seed tem o conteúdo editorial esperado", async () => {
    const db = createServiceClient();
    // 12 publicadas + 1 arquivada (P1: resposta 410 com motivo).
    const all = await db.from("articles").select("kind, status");
    expect(all.data!.filter((a) => a.status === "archived")).toHaveLength(1);
    const articles = { data: all.data!.filter((a) => a.status !== "archived") };
    expect(articles.data).toHaveLength(12);
    expect(articles.data!.filter((a) => a.kind === "original")).toHaveLength(4);
    expect(articles.data!.filter((a) => a.kind === "normalized")).toHaveLength(8);
    // P1-T6: duas matérias foram atualizadas depois de publicadas (atualização e correção).
    expect(articles.data!.every((a) => a.status === "published" || a.status === "updated")).toBe(
      true,
    );
    expect(articles.data!.filter((a) => a.status === "updated")).toHaveLength(2);
    const counts = await Promise.all(
      (["topics", "collected_items", "event_listings", "profiles"] as const).map(
        async (t) => (await db.from(t).select("*", { count: "exact", head: true })).count,
      ),
    );
    expect(counts).toEqual([3, 30, 10, 10]);
    // Outras suítes criam coleções de leitor, regras e pesos em paralelo: conta só o que é do seed.
    const collections = await db
      .from("collections")
      .select("*", { count: "exact", head: true })
      .eq("is_editorial", true);
    expect(collections.count).toBe(4);
    const rules = await db
      .from("rules")
      .select("force_review, body, active")
      .eq("version", 1)
      .single();
    expect(rules.data?.active).toBe(true);
    expect(rules.data?.force_review).toBe(true);
    expect(rules.data?.body).toEqual(DEFAULT_RULES);
    const weights = await db.from("rec_weights").select("active").eq("version", "rec-v1").single();
    expect(weights.data?.active).toBe(true);
  });
});

describe("RLS", () => {
  const draftSlug = `rascunho-rls-${Date.now()}`;
  afterAll(async () => {
    await createServiceClient().from("articles").delete().eq("slug", draftSlug);
  });

  it("anon lê matéria publicada e não lê rascunho", async () => {
    const service = createServiceClient();
    const inserted = await service.from("articles").insert({
      slug: draftSlug,
      kind: "original",
      section_slug: "cidade",
      title: "Rascunho que o público não pode ver",
      dek: "Teste de RLS",
      body: { type: "doc", content: [] },
      status: "draft",
    });
    expect(inserted.error).toBeNull();

    const anon = anonClient();
    const draft = await anon.from("articles").select("id").eq("slug", draftSlug);
    expect(draft.error).toBeNull();
    expect(draft.data).toHaveLength(0);

    const published = await anon
      .from("articles")
      .select("slug, status")
      .in("status", ["published", "updated"]);
    expect(published.data?.length).toBe(12);
  });

  it("anon não lê a tabela de fontes, só a view pública", async () => {
    const anon = anonClient();
    const base = await anon.from("sources").select("id");
    expect(base.data ?? []).toHaveLength(0);
    const view = await anon.from("public_sources").select("name");
    expect(view.data).toHaveLength(12);
    const aggregated = await anon.from("public_aggregated").select("id");
    expect(aggregated.data?.length).toBeGreaterThan(0);
  });

  it("editor altera matéria só na editoria dele", async () => {
    const otavio = anonClient();
    const login = await otavio.auth.signInWithPassword({
      email: "otavio.reis@citynews.local",
      password: SEED_PASSWORD,
    });
    expect(login.error).toBeNull();
    const cidade = await otavio
      .from("articles")
      .update({ urgent: false })
      .eq("slug", "moradores-do-porto-pedem-mais-sombra-na-orla")
      .select("id");
    expect(cidade.data).toHaveLength(1);
    const politica = await otavio
      .from("articles")
      .update({ urgent: false })
      .eq("slug", "camara-aprova-revisao-do-plano-diretor-de-cuiaba")
      .select("id");
    expect(politica.data ?? []).toHaveLength(0);
  });

  it("usuário de seed entra com a senha local", async () => {
    const anon = anonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      email: "marina.arruda@citynews.local",
      password: SEED_PASSWORD,
    });
    expect(error).toBeNull();
    expect(data.user?.email).toBe("marina.arruda@citynews.local");
  });
});
