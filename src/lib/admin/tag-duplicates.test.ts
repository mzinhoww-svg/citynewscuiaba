import { describe, expect, it } from "vitest";
import { suggestDuplicates, tagKey } from "./tag-duplicates";

describe("tagKey", () => {
  it("ignora acento, caixa, pontuação e plural simples", () => {
    expect(tagKey("Saúde")).toBe(tagKey("saude"));
    expect(tagKey("Obras públicas")).toBe(tagKey("obra publica"));
    expect(tagKey("  ")).toBe("");
  });
  it("mantém palavras curtas", () => {
    expect(tagKey("gás")).toBe("gas");
  });
});

describe("suggestDuplicates", () => {
  it("agrupa e sugere manter a mais usada", () => {
    const g = suggestDuplicates([
      { id: "1", name: "Saúde", articles: 2 },
      { id: "2", name: "saude", articles: 9 },
      { id: "3", name: "Esporte", articles: 1 },
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]?.keep.id).toBe("2");
    expect(g[0]?.others.map((t) => t.id)).toEqual(["1"]);
  });
  it("sem duplicata, nada", () => {
    expect(suggestDuplicates([{ id: "1", name: "A tag", articles: 0 }])).toEqual([]);
  });
});
