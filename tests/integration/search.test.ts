// @vitest-environment node
import { afterAll, describe, expect, it } from "vitest";
import { createServiceClient } from "@/lib/db/client";
import { SEARCH_DEFAULTS, type SearchFilters, type SearchResult } from "@/lib/search";
import { searchHybrid, suggest } from "@/lib/search/server";
import { hashEmbedding } from "@/lib/ai/hash-embedding";

const f = (change: Partial<SearchFilters> = {}): SearchFilters => ({
  ...SEARCH_DEFAULTS,
  ...change,
});

async function run(q: string, change: Partial<SearchFilters> = {}, embed?: number[] | null) {
  const r = await searchHybrid(q, f(change), { embed: async () => embed ?? null });
  if (!r.ok) throw new Error(`busca falhou: ${JSON.stringify(r.error)}`);
  return r.value;
}

const kinds = (r: SearchResult) => r.groups.flatMap((g) => g.items.map((i) => i.kind));
const titles = (r: SearchResult) =>
  r.groups.flatMap((g) => g.items.map((i) => i.item.title as string));

describe("busca híbrida (P3-T10, ADR-006)", () => {
  it("sem acento encontra com acento: 'onibus cpa' acha ônibus e CPA (Review Focus 5)", async () => {
    const r = await run("onibus cpa");
    expect(r.total).toBeGreaterThan(0);
    expect(titles(r).some((t) => /ônibus/.test(t) && /CPA/.test(t))).toBe(true);
  });

  it("agrupa por assunto quando há 2+ itens do mesmo assunto", async () => {
    const r = await run("viaduto");
    expect(r.groups[0]!.topic?.slug).toBe("obra-do-viaduto-na-miguel-sutil");
    expect(r.groups[0]!.items.length).toBeGreaterThanOrEqual(2);
  });

  it("Só CityNews não traz outros veículos; Outros veículos só traz agregados", async () => {
    const own = await run("viaduto", { origin: "citynews" });
    expect(own.total).toBeGreaterThan(0);
    expect(kinds(own)).not.toContain("aggregated");
    const others = await run("viaduto", { origin: "others" });
    expect(others.total).toBeGreaterThan(0);
    expect(new Set(kinds(others))).toEqual(new Set(["aggregated"]));
  });

  it("filtra por tipo, editoria e fonte", async () => {
    const events = await run("cpa", { type: "events" });
    expect(new Set(kinds(events))).toEqual(new Set(["event"]));
    const clima = await run("fumaca", { section: "clima", type: "articles" });
    expect(clima.total).toBeGreaterThan(0);
    for (const g of clima.groups)
      for (const i of g.items) if (i.kind === "article") expect(i.item.section.slug).toBe("clima");
    const folha = await run("viaduto", { source: "folha-do-cerrado" });
    for (const g of folha.groups)
      for (const i of g.items)
        if (i.kind === "aggregated") expect(i.item.sourceSlug).toBe("folha-do-cerrado");
  });

  it("encontra texto do corpo da matéria, não só título e linha fina", async () => {
    const r = await run("Praça Alencastro", { type: "articles" });
    expect(titles(r)).toContain(
      "O que muda nas linhas de ônibus entre o CPA e o Centro a partir de outubro",
    );
  });

  it("nada encontrado sugere grafia parecida do acervo", async () => {
    const r = await run("viadutu");
    expect(r.total).toBe(0);
    expect(r.didYouMean).toBe("viaduto");
  });

  it("consulta vazia ou só com símbolos não vai ao banco e volta vazia", async () => {
    expect((await run("   ")).total).toBe(0);
    expect((await run("&|!():*")).total).toBe(0);
  });

  it("vetor entra na fusão RRF: item sem termo em comum aparece pela semelhança", async () => {
    const db = createServiceClient();
    const text = "Mutirão de emprego oferece 800 vagas no Centro";
    const vec = hashEmbedding(text, 1536);
    const { error } = await db
      .from("articles")
      .update({ embedding: `[${vec.join(",")}]` })
      .eq("slug", "mutirao-de-emprego-oferece-800-vagas-no-centro");
    expect(error).toBeNull();
    const r = await run("trabalho carteira assinada", {}, vec);
    expect(r.semantic).toBe(true);
    expect(titles(r)[0]).toBe("Mutirão de emprego oferece 800 vagas no Centro de Cuiabá");
  });

  it("sugestões por prefixo sem acento", async () => {
    const r = await suggest("onib");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.some((s) => /ônibus/i.test(s))).toBe(true);
  });

  afterAll(async () => {
    await createServiceClient()
      .from("articles")
      .update({ embedding: null })
      .eq("slug", "mutirao-de-emprego-oferece-800-vagas-no-centro");
  });
});
