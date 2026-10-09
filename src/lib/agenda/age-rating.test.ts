import { describe, expect, it } from "vitest";
import { normalizeAgeRating } from "./age-rating";

describe("normalizeAgeRating", () => {
  it("livre em qualquer forma comum", () => {
    for (const t of ["livre", "Livre", "L", " l ", "Classificação livre", "classificacao: LIVRE"])
      expect(normalizeAgeRating(t)).toBe("livre");
  });

  it("idades da lista fechada", () => {
    expect(normalizeAgeRating("Classificação: 16 anos")).toBe("16");
    expect(normalizeAgeRating("Censura 18 anos")).toBe("18");
    expect(normalizeAgeRating("Não recomendado para menores de 12 anos")).toBe("12");
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

  it('"N anos" sem sinal de classificação não é faixa etária', () => {
    expect(normalizeAgeRating("Crianças até 12 anos não pagam")).toBe("consulte");
    expect(normalizeAgeRating("16 anos")).toBe("consulte");
    expect(normalizeAgeRating("Casa celebra 18 anos de história")).toBe("consulte");
  });

  it("regra de ingresso não vira faixa etária", () => {
    for (const t of [
      "Menores de 12 anos não pagam",
      "Crianças menores de 10 anos não pagam",
      "Menores de 12 anos pagam meia",
      "Menores de 16 anos acompanhados dos pais",
      "Ingresso R$ 50 +10 de taxa; crianças até 12 anos não pagam",
      "Entrada livre",
    ])
      expect(normalizeAgeRating(t)).toBe("consulte");
  });

  it("vale o número colado ao sinal de classificação, não o primeiro do texto", () => {
    expect(normalizeAgeRating("Crianças até 12 anos não pagam. Classificação 16 anos")).toBe("16");
    expect(normalizeAgeRating("Menores de 12 anos não pagam. Proibido para menores de 18")).toBe(
      "18",
    );
    expect(normalizeAgeRating("Classificação 16 anos. Entrada livre")).toBe("16");
  });

  it("outras formas comuns de classificação", () => {
    expect(normalizeAgeRating("A partir de 16 anos")).toBe("16");
    expect(normalizeAgeRating("Faixa etária: 14 anos")).toBe("14");
    expect(normalizeAgeRating("Idade mínima: 18 anos")).toBe("18");
    expect(normalizeAgeRating("Para maiores de 18")).toBe("18");
    expect(normalizeAgeRating("Censura: 16")).toBe("16");
    expect(normalizeAgeRating("Classificação etária: 16")).toBe("16");
    expect(normalizeAgeRating("Não recomendado para menores de 16")).toBe("16");
    expect(normalizeAgeRating("Livre para todos os públicos")).toBe("livre");
  });

  it("valor já fechado passa como está", () => {
    for (const v of ["livre", "10", "12", "14", "16", "18", "consulte"])
      expect(normalizeAgeRating(v)).toBe(v);
  });
});
