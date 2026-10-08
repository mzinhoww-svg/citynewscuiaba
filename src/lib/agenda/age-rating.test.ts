import { describe, expect, it } from "vitest";
import { normalizeAgeRating } from "./age-rating";

describe("normalizeAgeRating", () => {
  it("livre em qualquer forma comum", () => {
    for (const t of ["livre", "Livre", "L", " l ", "Classificação livre", "classificacao: LIVRE"])
      expect(normalizeAgeRating(t)).toBe("livre");
  });

  it("idades da lista fechada", () => {
    expect(normalizeAgeRating("16 anos")).toBe("16");
    expect(normalizeAgeRating("+16")).toBe("16");
    expect(normalizeAgeRating("18+")).toBe("18");
    expect(normalizeAgeRating("classificação 14")).toBe("14");
    expect(normalizeAgeRating("Classificação indicativa: 12 anos")).toBe("12");
    expect(normalizeAgeRating("Proibido para menores de 18 anos")).toBe("18");
    expect(normalizeAgeRating("10")).toBe("10");
  });

  it("fora da lista, vazio ou ilegível: consulte", () => {
    for (const t of ["", "   ", "15 anos", "+21", "Classificação 8", "consultar", "Show às 16h"])
      expect(normalizeAgeRating(t)).toBe("consulte");
    expect(normalizeAgeRating(null)).toBe("consulte");
    expect(normalizeAgeRating(undefined)).toBe("consulte");
  });

  it("valor já fechado passa como está", () => {
    for (const v of ["livre", "10", "12", "14", "16", "18", "consulte"])
      expect(normalizeAgeRating(v)).toBe(v);
  });
});
