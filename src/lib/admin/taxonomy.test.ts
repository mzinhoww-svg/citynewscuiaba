import { describe, expect, it } from "vitest";
import { normalizeTag, slugify, suggestTagMerges } from "./taxonomy";

describe("taxonomia (A05)", () => {
  it("sugere mesclar tags iguais sem acento, caixa, espaço ou plural, mantendo a mais usada", () => {
    const s = suggestTagMerges([
      { tag: "ônibus", articles: 12, items: 3 },
      { tag: "onibus", articles: 2, items: 0 },
      { tag: "Onibus", articles: 1, items: 0 },
      { tag: "viaduto", articles: 4, items: 1 },
      { tag: "viadutos", articles: 1, items: 0 },
      { tag: "centro norte", articles: 1, items: 0 },
      { tag: "centro-norte", articles: 3, items: 0 },
      { tag: "clima", articles: 9, items: 9 },
    ]);
    expect(s).toEqual([
      { into: "centro-norte", from: ["centro norte"], reason: "spacing" },
      { into: "ônibus", from: ["onibus", "Onibus"], reason: "accent" },
      { into: "viaduto", from: ["viadutos"], reason: "plural" },
    ]);
  });

  it("não sugere nada sem duplicata e não confunde 'ônibus' com plural", () => {
    expect(suggestTagMerges([{ tag: "ônibus", articles: 1, items: 0 }])).toEqual([]);
    expect(normalizeTag("  Centro  Norte ")).toBe("centro-norte");
    expect(slugify("Guia Cuiabá!")).toBe("guia-cuiaba");
  });
});
