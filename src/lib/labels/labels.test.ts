import { labelsFor, plaqueOf, publicImageCaption, publicLabels } from ".";
const base = { hasAiSummary: false, publishMode: null, sponsored: false } as const;
it("ordem fixa texto → IA → imagem → publicação e máximo 4", () => {
  const r = labelsFor({
    ...base,
    kind: "normalized",
    sourceCount: 7,
    hasAiSummary: true,
    publishMode: "auto",
    image: { kind: "illustrative" },
    sponsored: false,
    reviewerName: undefined,
  });
  expect(r.shown.map((l) => l.kind)).toEqual([
    "normalized",
    "ai_summary",
    "image_illustrative",
    "auto_published",
  ]);
  expect(r.shown[0]!.detail).toBe("7 fontes");
});
it("excedente vai para hidden", () => {
  const r = labelsFor({
    ...base,
    kind: "normalized",
    sourceCount: 3,
    hasAiSummary: true,
    publishMode: "human",
    reviewerName: "Marina Arruda",
    image: { kind: "original", credit: "Pedro Alencar" },
    sponsored: true,
  });
  expect(r.shown).toHaveLength(4);
  expect(r.hidden.map((l) => l.kind)).toEqual(["sponsored"]);
});
it("agregado leva nome da fonte e nunca rótulo de publicação", () => {
  const r = labelsFor({
    ...base,
    kind: "aggregated",
    sourceName: "Folha do Cerrado",
    publishMode: "auto",
  });
  expect(r.shown).toEqual([{ kind: "aggregated", text: "AGREGADO", detail: "Folha do Cerrado" }]);
});
it("uma fonte fica no singular", () => {
  const r = labelsFor({ ...base, kind: "normalized", sourceCount: 1 });
  expect(r.shown[0]!.detail).toBe("1 fonte");
});
it("reprodução mostra fonte e crédito do autor", () => {
  const r = labelsFor({
    ...base,
    kind: "original",
    image: { kind: "reproduction", sourceName: "MT Agora", credit: "Ana Lima" },
  });
  expect(r.shown[1]).toEqual({
    kind: "image_reproduction",
    text: "REPRODUÇÃO",
    detail: "MT Agora · Ana Lima",
  });
});
it("revisão humana leva o nome de quem revisou", () => {
  const r = labelsFor({ ...base, kind: "original", publishMode: "human", reviewerName: "Marina" });
  expect(r.shown.map((l) => l.text)).toEqual(["ORIGINAL CITYNEWS", "REVISADO POR HUMANO"]);
  expect(r.shown[1]!.detail).toBe("Marina");
});

// Revisão do gate P0
it("imagem licenciada mantém fonte e crédito", () => {
  const r = labelsFor({
    ...base,
    kind: "original",
    image: { kind: "licensed", sourceName: "Agência Cerrado", credit: "Ana Lima" },
  });
  expect(r.shown[1]).toEqual({
    kind: "image_licensed",
    text: "IMAGEM LICENCIADA",
    detail: "Agência Cerrado · Ana Lima",
  });
});
it("imagem licenciada só com crédito mostra o crédito", () => {
  const r = labelsFor({
    ...base,
    kind: "original",
    image: { kind: "licensed", credit: "Ana Lima" },
  });
  expect(r.shown[1]!.detail).toBe("Ana Lima");
});
it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
  "max %d não finito vira 4",
  (max) => {
    const r = labelsFor(
      {
        ...base,
        kind: "normalized",
        sourceCount: 3,
        hasAiSummary: true,
        publishMode: "auto",
        image: { kind: "illustrative" },
        sponsored: true,
      },
      max,
    );
    expect(r.shown).toHaveLength(4);
    expect(r.hidden).toHaveLength(1);
  },
);
it.each([0, undefined, -2, Number.NaN, 1.5])(
  "normalizado com sourceCount %s não mostra número enganoso",
  (sourceCount) => {
    const r = labelsFor({ ...base, kind: "normalized", sourceCount });
    expect(r.shown[0]).toEqual({ kind: "normalized", text: "NORMALIZADO PELO CITYNEWS" });
  },
);

// UI-T3 e LAB-T1: vocabulário público (spec 2026-10-02 §4.1; spec 2026-10-03 R16 e R17)
describe("publicLabels", () => {
  it("reportagem própria: plaqueta ORIGINAL e nenhuma frase de origem", () => {
    expect(publicLabels({ kind: "original" })).toEqual({ plaque: "original" });
  });

  it("texto derivado: 'Feito a partir de n fontes' em texto, sem plaqueta", () => {
    expect(publicLabels({ kind: "normalized", sourceCount: 2 })).toEqual({
      originText: "Feito a partir de 2 fontes",
    });
    expect(publicLabels({ kind: "normalized", sourceCount: 1 }).originText).toBe(
      "Feito a partir de 1 fonte",
    );
  });

  it.each([0, undefined, -2, Number.NaN, 1.5])("contagem inválida (%s) não mostra número", (n) => {
    expect(publicLabels({ kind: "normalized", sourceCount: n }).originText).toBe(
      "Feito a partir de outras fontes",
    );
  });

  it("nunca devolve texto de revisão, qualquer que seja o modo de publicação ou o revisor", () => {
    // Uma matéria inteira (com modo de publicação e revisor) pode ser passada como entrada.
    const human = { kind: "original" as const, publishMode: "human", reviewer: "Marina Arruda" };
    const auto = { kind: "normalized" as const, sourceCount: 3, publishMode: "auto" };
    expect(publicLabels(human)).toEqual({ plaque: "original" });
    expect(publicLabels(auto)).toEqual({ originText: "Feito a partir de 3 fontes" });
    for (const r of [publicLabels(human), publicLabels(auto)]) {
      expect(
        Object.keys(r).every((k) => ["plaque", "originText", "sponsoredText"].includes(k)),
      ).toBe(true);
    }
  });

  it("agregado: plaqueta AGREGADO e nada mais", () => {
    expect(publicLabels({ kind: "aggregated" })).toEqual({ plaque: "aggregated" });
  });

  it("patrocinado vira texto próprio, nunca uma segunda plaqueta", () => {
    expect(publicLabels({ kind: "original", sponsored: true })).toEqual({
      plaque: "original",
      sponsoredText: "Patrocinado",
    });
  });

  it("nenhum texto público contém o vocabulário de revisão, geração ou IA (R16)", () => {
    const all = [
      publicLabels({ kind: "normalized", sourceCount: 4, sponsored: true }),
      publicLabels({ kind: "original" }),
      publicLabels({ kind: "aggregated" }),
    ]
      .flatMap((r) => [r.originText, r.sponsoredText])
      .join(" ");
    expect(all).not.toMatch(
      /normaliz|\bIA\b|inteligência artificial|publicado automaticamente|revisad|gerad|automátic|autonomia/i,
    );
  });
});

describe("publicImageCaption", () => {
  it("imagem de terceiros é uma frase: 'Foto: reprodução web · Fonte'", () => {
    expect(publicImageCaption("reproduction", "MT Agora")).toBe("Foto: reprodução web · MT Agora");
    expect(publicImageCaption("reproduction")).toBe("Foto: reprodução web");
  });

  it("os demais tipos mantêm a legenda em frase", () => {
    expect(publicImageCaption("original", "Pedro Alencar")).toBe("Foto original · Pedro Alencar");
    expect(publicImageCaption("illustrative")).toBe("Imagem ilustrativa");
  });

  it("imagem de gerador também sai como 'Imagem ilustrativa' (R16)", () => {
    expect(publicImageCaption("ai_generated")).toBe("Imagem ilustrativa");
  });
});

describe("plaqueOf", () => {
  it("pega só ORIGINAL ou AGREGADO de um conjunto de rótulos", () => {
    const set = labelsFor({
      ...base,
      kind: "aggregated",
      sourceName: "MT Agora",
      hasAiSummary: true,
    });
    expect(plaqueOf(set)).toEqual({ kind: "aggregated", text: "AGREGADO", detail: "MT Agora" });
    expect(plaqueOf(labelsFor({ ...base, kind: "normalized", sourceCount: 2 }))).toBeUndefined();
  });
});
