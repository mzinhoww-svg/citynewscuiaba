import { computeConfidence as c } from ".";
it.each([
  [
    { independentSources: 2, primarySources: 1, centralConflict: false, hoursSinceUpdate: 3 },
    "alta",
    0.9,
  ],
  [
    { independentSources: 1, primarySources: 1, centralConflict: false, hoursSinceUpdate: 3 },
    "média",
    0.8,
  ],
  [
    { independentSources: 1, primarySources: 0, centralConflict: false, hoursSinceUpdate: 3 },
    "baixa",
    0.5,
  ],
  [
    { independentSources: 2, primarySources: 0, centralConflict: false, hoursSinceUpdate: 3 },
    "média",
    0.6,
  ],
  [
    { independentSources: 3, primarySources: 1, centralConflict: true, hoursSinceUpdate: 30 },
    "baixa",
    0.65,
  ],
  // Plano dizia 0,84; pela fórmula da spec §6.3 (freshness 0,3 para 30 h, a mesma do caso acima) o score é 0,795 → 0,80.
  [
    { independentSources: 2, primarySources: 1, centralConflict: false, hoursSinceUpdate: 30 },
    "média",
    0.8,
  ],
])("%o → %s %d", (input, level, score) => {
  const r = c(input);
  expect(r.level).toBe(level);
  expect(r.score).toBe(score);
});
it("explica o motivo em pt-BR", () => {
  expect(
    c({ independentSources: 1, primarySources: 0, centralConflict: false, hoursSinceUpdate: 1 })
      .reasons,
  ).toContain("Apenas 1 fonte independente");
});
it("lista todos os motivos aplicáveis", () => {
  expect(
    c({ independentSources: 1, primarySources: 0, centralConflict: true, hoursSinceUpdate: 80 })
      .reasons,
  ).toEqual([
    "Apenas 1 fonte independente",
    "Sem fonte primária",
    "Fontes divergem em fato central",
    "Atualizada há mais de 24 h",
  ]);
});
it("confiança alta não tem motivos", () => {
  expect(
    c({ independentSources: 3, primarySources: 2, centralConflict: false, hoursSinceUpdate: 1 }),
  ).toEqual({ level: "alta", score: 1, reasons: [] });
});
it("frescor cai por faixa: ≤ 6 h, ≤ 24 h, ≤ 72 h, > 72 h", () => {
  const at = (h: number) =>
    c({ independentSources: 3, primarySources: 1, centralConflict: false, hoursSinceUpdate: h })
      .score;
  expect([at(6), at(24), at(72), at(73)]).toEqual([1, 0.94, 0.9, 0.85]);
});
