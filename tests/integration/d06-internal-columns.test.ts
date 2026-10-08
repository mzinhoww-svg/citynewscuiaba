// @vitest-environment node
// D-06 (migrations 0153 e 0187): a chave anônima não lê os metadados internos da matéria.
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { getHomeData, listSection } from "@/lib/db/queries";
import {
  ARTICLE_COLUMNS,
  ARTICLE_COLUMNS_HYDRATED,
  getArticleBySlug,
} from "@/lib/db/queries/articles";

const anon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);
const service = createServiceClient();
const tag = randomUUID().slice(0, 8);
const created: string[] = [];

describe("colunas internas de articles fora do anônimo (D-06)", () => {
  it("o portal continua lendo o que mostra", async () => {
    const { data, error } = await anon
      .from("articles")
      .select("id, slug, title, dek, published_at, seo_title")
      .in("status", ["published", "updated"])
      .limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBeGreaterThan(0);
  });

  it.each([
    "ai_fallback",
    "review_reason",
    "rules_version",
    "risk_level",
    "due_at",
    // 0187 (A-138): o fechamento que faltava.
    "publish_mode",
    "agent_id",
    "confidence",
  ])("anônimo não lê %s", async (col) => {
    const { error } = await anon.from("articles").select(col).limit(1);
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("anônimo não lê a matéria inteira (select *)", async () => {
    const { error } = await anon.from("articles").select("*").limit(1);
    expect(error?.message ?? "").toMatch(/permission denied/i);
  });

  it("a equipe (service role) continua lendo as três", async () => {
    const { data, error } = await service
      .from("articles")
      .select("publish_mode, agent_id, confidence")
      .limit(1);
    expect(error).toBeNull();
    expect(data?.length).toBe(1);
  });

  it("as colunas que o portal seleciona cabem no grant do anônimo", async () => {
    for (const cols of [ARTICLE_COLUMNS, ARTICLE_COLUMNS_HYDRATED]) {
      const { data, error } = await anon
        .from("articles")
        .select(cols)
        .in("status", ["published", "updated"])
        .limit(3);
      expect(error).toBeNull();
      expect(data?.length).toBeGreaterThan(0);
    }
  });
});

describe("faixa Urgente sem publish_mode (urgent_strip, 0187)", () => {
  const cases = [
    {
      key: "humana-nacional",
      urgent: true,
      mode: "human",
      scope: "national",
      commotion: false,
      strip: true,
    },
    {
      key: "auto-nacional",
      urgent: true,
      mode: "auto",
      scope: "national",
      commotion: false,
      strip: false,
    },
    {
      key: "auto-comocao",
      urgent: true,
      mode: "auto",
      scope: "national",
      commotion: true,
      strip: true,
    },
    {
      key: "auto-local",
      urgent: true,
      mode: "auto",
      scope: "cuiaba",
      commotion: false,
      strip: true,
    },
    {
      key: "auto-sem-escopo",
      urgent: true,
      mode: "auto",
      scope: null,
      commotion: false,
      strip: true,
    },
    {
      key: "nao-urgente",
      urgent: false,
      mode: "human",
      scope: "cuiaba",
      commotion: false,
      strip: false,
    },
  ] as const;

  beforeAll(async () => {
    const rows = cases.map((c) => ({
      id: randomUUID(),
      slug: `d06-${tag}-${c.key}`,
      kind: "original" as const,
      section_slug: "cidade",
      title: `D-06 ${c.key} ${tag}`,
      dek: "Linha fina",
      body: { type: "doc", content: [] },
      status: "published" as const,
      publish_mode: c.mode,
      urgent: c.urgent,
      news_scope: c.scope,
      national_commotion: c.commotion,
      // Antigas: fora da home recente, não mexem nas outras suítes.
      published_at: new Date(Date.now() - 500 * 86_400_000).toISOString(),
      publish_destinations: ["section"],
    }));
    const r = await service.from("articles").insert(rows);
    if (r.error) throw r.error;
    created.push(...rows.map((x) => x.id));
  });

  afterAll(async () => {
    await service.from("articles").delete().in("id", created);
  });

  it.each(cases)("$key → $strip", async (c) => {
    const { data, error } = await anon
      .from("articles")
      .select("urgent_strip")
      .eq("slug", `d06-${tag}-${c.key}`)
      .single();
    expect(error).toBeNull();
    expect(data?.urgent_strip).toBe(c.strip);
  });

  it("acompanha a mudança de escopo (coluna gerada)", async () => {
    const slug = `d06-${tag}-auto-nacional`;
    const u = await service.from("articles").update({ news_scope: "mt" }).eq("slug", slug);
    expect(u.error).toBeNull();
    const { data } = await anon.from("articles").select("urgent_strip").eq("slug", slug).single();
    expect(data?.urgent_strip).toBe(true);
    await service.from("articles").update({ news_scope: "national" }).eq("slug", slug);
  });
});

describe("leituras públicas com a chave anônima (0187)", () => {
  it("home", async () => {
    const r = await getHomeData();
    expect(r.ok, JSON.stringify(!r.ok && r.error)).toBe(true);
  }, 30_000);

  it("editoria", async () => {
    const r = await listSection("cidade");
    expect(r.ok, JSON.stringify(!r.ok && r.error)).toBe(true);
  });

  it("matéria", async () => {
    const { data } = await anon
      .from("articles")
      .select("slug")
      .in("status", ["published", "updated"])
      .limit(1)
      .single();
    const r = await getArticleBySlug(data!.slug);
    expect(r.ok, JSON.stringify(!r.ok && r.error)).toBe(true);
  });
});
