import { describe, expect, it } from "vitest";
import { independentLineages } from "./lineage";

const item = (id: string, sourceId: string, title: string, excerpt: string | null = null) => ({
  id,
  sourceId,
  title,
  excerpt,
});

const RELEASE =
  "A Prefeitura de Cuiabá anunciou nesta segunda-feira a duplicação da avenida das Torres, com " +
  "investimento de R$ 60 milhões e prazo de 18 meses para a conclusão das obras no trecho central.";

describe("independentLineages (cópia do mesmo texto não é confirmação independente)", () => {
  it("sem itens: zero", () => {
    expect(independentLineages([])).toBe(0);
  });

  it("veículos diferentes com textos próprios contam um cada", () => {
    expect(
      independentLineages([
        item(
          "a",
          "folha-do-cerrado",
          "Avenida das Torres será duplicada",
          "Obra custa R$ 60 milhões.",
        ),
        item("b", "mt-agora", "Prefeitura promete obra em 18 meses", "Moradores cobram prazo."),
        item(
          "c",
          "diario-oficial",
          "Extrato do contrato da avenida das Torres",
          "Contrato 12/2026.",
        ),
      ]),
    ).toBe(3);
  });

  it("vários veículos republicando o mesmo release contam como uma linhagem", () => {
    expect(
      independentLineages([
        item("a", "folha-do-cerrado", "Avenida das Torres será duplicada", RELEASE),
        item("b", "mt-agora", "Prefeitura vai duplicar a avenida das Torres", RELEASE),
        item("c", "portal-varzea", "Avenida das Torres terá duplicação", `${RELEASE} Leia mais.`),
      ]),
    ).toBe(1);
  });

  it("release copiado + um veículo com apuração própria: duas linhagens", () => {
    expect(
      independentLineages([
        item("a", "folha-do-cerrado", "Avenida das Torres será duplicada", RELEASE),
        item("b", "mt-agora", "Prefeitura vai duplicar a avenida das Torres", RELEASE),
        item(
          "c",
          "portal-varzea",
          "Moradores da avenida das Torres temem desapropriação",
          "Comerciantes ouvidos pela reportagem dizem que não foram procurados pela prefeitura.",
        ),
      ]),
    ).toBe(2);
  });

  it("dois itens do mesmo veículo nunca contam duas vezes", () => {
    expect(
      independentLineages([
        item("a", "mt-agora", "Avenida das Torres será duplicada", "Obra custa R$ 60 milhões."),
        item("b", "mt-agora", "Moradores temem desapropriação", "Comerciantes não foram ouvidos."),
      ]),
    ).toBe(1);
  });

  it("título igual com trechos diferentes não é cópia (títulos curtos se repetem)", () => {
    expect(
      independentLineages([
        item(
          "a",
          "folha-do-cerrado",
          "Chuva forte em Cuiabá",
          "Defesa Civil registra 40 mm no CPA.",
        ),
        item(
          "b",
          "mt-agora",
          "Chuva forte em Cuiabá",
          "Queda de árvore bloqueia a avenida do CPA.",
        ),
      ]),
    ).toBe(2);
  });

  it("sem trecho, só o título não basta para juntar veículos", () => {
    expect(
      independentLineages([
        item("a", "folha-do-cerrado", "Avenida das Torres será duplicada"),
        item("b", "mt-agora", "Avenida das Torres será duplicada"),
      ]),
    ).toBe(2);
  });
});
