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
