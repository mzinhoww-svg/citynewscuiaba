import { describe, expect, it } from "vitest";
import { orderIndexLists, rankList, type ScoredVenue } from "./rank";

const v = (name: string, score: number, id = name.toLowerCase()): ScoredVenue => ({
  venueId: id,
  name,
  score,
  breakdown: {},
});

describe("rankList", () => {
  it("ordena por pontuação e corta em `take`", () => {
    const out = rankList([v("B", 50), v("A", 80), v("C", 65), v("D", 10)], 3);
    expect(out.map((x) => x.name)).toEqual(["A", "C", "B"]);
    expect(out.map((x) => x.position)).toEqual([1, 2, 3]);
  });

  it("desempate estável por nome (sem acento, sem caixa), depois por id", () => {
    const items = [v("Zé", 70, "3"), v("Álvaro", 70, "2"), v("alvaro", 70, "1"), v("Bia", 70, "4")];
    const a = rankList(items, 10).map((x) => x.venueId);
    const b = rankList([...items].reverse(), 10).map((x) => x.venueId);
    expect(a).toEqual(["1", "2", "4", "3"]);
    expect(b).toEqual(a);
  });

  it("não muda a entrada e aceita take maior que a lista", () => {
    const items = [v("B", 1), v("A", 2)];
    const copy = structuredClone(items);
    expect(rankList(items, 99)).toHaveLength(2);
    expect(items).toEqual(copy);
  });

  it("take zero, negativo ou lista vazia devolvem vazio", () => {
    expect(rankList([], 5)).toEqual([]);
    expect(rankList([v("A", 1)], 0)).toEqual([]);
    expect(rankList([v("A", 1)], -2)).toEqual([]);
  });

  it("ignora qualquer marca de patrocínio na entrada: a ordem vem só da pontuação", () => {
    const sponsored = { ...v("Patrocinado", 10), sponsored: true } as ScoredVenue;
    const out = rankList([sponsored, v("Melhor", 90), v("Meio", 50)], 3);
    expect(out.map((x) => x.name)).toEqual(["Melhor", "Meio", "Patrocinado"]);
  });
});

describe("orderIndexLists", () => {
  const l = (slug: string, publishedAt: string, sponsored = false) => ({
    slug,
    publishedAt,
    sponsored,
  });
  it("editoriais por data e patrocinadas em grupo à parte, sem deslocar as editoriais", () => {
    const editorial = [l("a", "2026-10-01"), l("b", "2026-09-20"), l("c", "2026-10-02")];
    const without = orderIndexLists(editorial);
    const withSponsored = orderIndexLists([
      l("p1", "2026-10-03", true),
      ...editorial,
      l("p2", "2026-09-01", true),
    ]);
    expect(without.editorial.map((x) => x.slug)).toEqual(["c", "a", "b"]);
    expect(withSponsored.editorial.map((x) => x.slug)).toEqual(
      without.editorial.map((x) => x.slug),
    );
    expect(withSponsored.sponsored.map((x) => x.slug)).toEqual(["p1", "p2"]);
  });
});
