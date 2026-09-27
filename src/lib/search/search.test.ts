import { describe, expect, it } from "vitest";
import {
  groupHits,
  highlightSegments,
  normalizeQuery,
  parseSearchParams,
  queryTerms,
  searchHref,
  serializeSearch,
  SEARCH_DEFAULTS,
  type RankedHit,
} from ".";

describe("filtros da busca na URL (P12)", () => {
  it("lê q, tipo, origem, editoria, período e fonte; valor desconhecido vira padrão", () => {
    const f = parseSearchParams({
      q: "  viaduto   miguel sutil ",
      tipo: "materias",
      origem: "citynews",
      editoria: "cidade",
      periodo: "7d",
      fonte: "folha-do-cerrado",
    });
    expect(f).toEqual({
      q: "viaduto miguel sutil",
      type: "articles",
      origin: "citynews",
      section: "cidade",
      period: "7d",
      source: "folha-do-cerrado",
    });
    expect(
      parseSearchParams({ tipo: "x", origem: "<script>", editoria: "../a", periodo: "1y" }),
    ).toEqual(SEARCH_DEFAULTS);
  });

  it("serializa só o que difere do padrão, em ordem estável", () => {
    const f = parseSearchParams({ q: "ônibus cpa", origem: "citynews" });
    expect(serializeSearch(f)).toBe("q=%C3%B4nibus+cpa&origem=citynews");
    expect(searchHref(f, { origin: "all" })).toBe("/busca?q=%C3%B4nibus+cpa");
    expect(searchHref(SEARCH_DEFAULTS)).toBe("/busca");
  });

  it("normaliza espaços, controla tamanho e ignora controle", () => {
    expect(normalizeQuery("a\u0000b\n\tc")).toBe("a b c");
    expect(normalizeQuery("x".repeat(500))).toHaveLength(200);
  });

  it("termos sem acento, sem palavras vazias e sem repetição", () => {
    expect(queryTerms("O ônibus do CPA e o ônibus")).toEqual(["onibus", "cpa"]);
  });
});

describe("destaque de termos", () => {
  it("marca a palavra com acento quando a busca não tem acento", () => {
    expect(highlightSegments("Novo plano de ônibus entre CPA e Centro", ["onibus", "cpa"])).toEqual(
      [
        { text: "Novo plano de ", mark: false },
        { text: "ônibus", mark: true },
        { text: " entre ", mark: false },
        { text: "CPA", mark: true },
        { text: " e Centro", mark: false },
      ],
    );
  });

  it("marca variações da mesma raiz (plural) e não marca pedaço de outra palavra", () => {
    const segs = highlightSegments("Viadutos e o viaduto; aviaduto", ["viaduto"]);
    expect(segs.filter((s) => s.mark).map((s) => s.text)).toEqual(["Viadutos", "viaduto"]);
  });

  it("texto com HTML continua texto (o componente escapa)", () => {
    expect(highlightSegments("<script>alert(1)</script> ônibus", ["onibus"])).toEqual([
      { text: "<script>alert(1)</script> ", mark: false },
      { text: "ônibus", mark: true },
    ]);
  });

  it("sem termos devolve o texto inteiro", () => {
    expect(highlightSegments("Cuiabá", [])).toEqual([{ text: "Cuiabá", mark: false }]);
  });
});

describe("agrupamento por assunto", () => {
  const hit = (id: string, topicId: string | null, kind: RankedHit["kind"] = "article") => ({
    kind,
    id,
    topicId,
    score: 0,
  });

  it("2+ itens do mesmo assunto viram um grupo na posição do melhor item", () => {
    const groups = groupHits([
      hit("a1", null),
      hit("a2", "t1"),
      hit("t1", "t1", "topic"),
      hit("g1", "t1", "aggregated"),
      hit("a3", "t2"),
    ]);
    expect(groups).toEqual([
      { topicId: null, hits: [hit("a1", null)] },
      { topicId: "t1", hits: [hit("a2", "t1"), hit("g1", "t1", "aggregated")] },
      { topicId: null, hits: [hit("a3", "t2")] },
    ]);
  });

  it("assunto com um só item não agrupa; o próprio assunto fica como resultado", () => {
    expect(groupHits([hit("t1", "t1", "topic"), hit("a1", "t1")])).toEqual([
      { topicId: null, hits: [hit("t1", "t1", "topic")] },
      { topicId: null, hits: [hit("a1", "t1")] },
    ]);
  });
});
