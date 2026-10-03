import { describe, expect, it } from "vitest";
import { listCriteriaText } from "./criteria";
import { DEFAULT_WEIGHTS } from "./score";
import type { GuideTemplate } from "./types";

const t: GuideTemplate = {
  slug: "padarias-cuiaba",
  title: "As 5 melhores padarias de Cuiabá",
  noun: "padarias",
  category: "padaria",
  subcategory: null,
  neighborhood: null,
  take: 5,
  minVenues: 5,
};

describe("listCriteriaText", () => {
  it("explica os sinais, os pesos e a regra de duas fontes, em texto simples", () => {
    const s = listCriteriaText(t, DEFAULT_WEIGHTS);
    expect(s).toContain("padarias");
    expect(s).toContain("Cuiabá");
    expect(s).toMatch(/nota/i);
    expect(s).toMatch(/TripAdvisor/);
    expect(s).toMatch(/matérias do CityNews/);
    expect(s).toMatch(/duas fontes/);
    expect(s).toMatch(/patrocínio nunca altera a ordem/i);
    expect(s).toMatch(/\d+%/);
  });

  it("nunca usa o vocabulário proibido na tela pública", () => {
    const s = listCriteriaText(t, DEFAULT_WEIGHTS);
    expect(s).not.toMatch(/\bIA\b|inteligência artificial|gerad[oa] por|revisad|normalizad/i);
  });

  it("os percentuais somam 100 e sinais sem dado ficam de fora do texto", () => {
    const s = listCriteriaText(t, DEFAULT_WEIGHTS, { signals: { rating: true, rank: false } });
    expect(s).not.toMatch(/TripAdvisor/);
    const pct = [...s.matchAll(/(\d+)%/g)].map((m) => Number(m[1]));
    expect(pct.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("menciona o bairro quando o modelo tem", () => {
    const s = listCriteriaText({ ...t, neighborhood: "Coxipó" }, DEFAULT_WEIGHTS);
    expect(s).toContain("Coxipó");
  });
});
