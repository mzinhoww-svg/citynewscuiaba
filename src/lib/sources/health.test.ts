import { healthLabel, operationalScore } from "./health";

describe("operationalScore", () => {
  it("95 com 90% de disponibilidade, sem erro em 24 h e fresca", () => {
    expect(
      operationalScore({
        ok30: 90,
        failed30: 10,
        ok24h: 48,
        failed24h: 0,
        hoursSinceNewItem: 1,
        expectedGapHours: 1,
      }),
    ).toBe(95);
  });

  it("sem coletas = sem dados", () => {
    expect(
      healthLabel(
        operationalScore({
          ok30: 0,
          failed30: 0,
          ok24h: 0,
          failed24h: 0,
          hoursSinceNewItem: null,
          expectedGapHours: 1,
        }),
      ),
    ).toBe("sem_dados");
  });

  it("rótulos por faixa", () => {
    expect(healthLabel(85)).toBe("saudavel");
    expect(healthLabel(80)).toBe("saudavel");
    expect(healthLabel(79)).toBe("atencao");
    expect(healthLabel(50)).toBe("atencao");
    expect(healthLabel(49)).toBe("critica");
  });

  it("disponibilidade baixa e erro alto derrubam o score", () => {
    const score = operationalScore({
      ok30: 10,
      failed30: 90,
      ok24h: 0,
      failed24h: 24,
      hoursSinceNewItem: 48,
      expectedGapHours: 1,
    });
    expect(score).not.toBeNull();
    expect(healthLabel(score)).toBe("critica");
  });
});
