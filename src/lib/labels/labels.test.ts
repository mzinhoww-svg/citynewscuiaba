import { labelsFor } from ".";
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
    image: { kind: "licensed", sourceName: "Agência MT", credit: "Ana Lima" },
  });
  expect(r.shown[1]).toEqual({
    kind: "image_licensed",
    text: "IMAGEM LICENCIADA",
    detail: "Agência MT · Ana Lima",
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
