import { healthLabel, operationalScore } from "./health";

const h = {
  ok30: 90,
  failed30: 10,
  ok24h: 48,
  failed24h: 0,
  hoursSinceNewItem: 1,
  expectedGapHours: 1,
};

describe("saúde operacional", () => {
  it("95 com 90% de disponibilidade, sem erro em 24 h e fresca", () =>
    expect(operationalScore(h)).toBe(95));
  it("sem coletas = sem dados", () =>
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
    ).toBe("sem_dados"));
  it("frescor: 1 até 2x o intervalo, 0,5 até 4x, 0 depois", () => {
    const s = (hours: number | null) =>
      operationalScore({ ...h, ok30: 100, failed30: 0, hoursSinceNewItem: hours });
    expect(s(2)).toBe(100);
    expect(s(3)).toBe(90);
    expect(s(4)).toBe(90);
    expect(s(5)).toBe(80);
    expect(s(null)).toBe(80);
  });
  it("erro em 24 h pesa 30%", () =>
    expect(operationalScore({ ...h, ok30: 100, failed30: 0, ok24h: 24, failed24h: 24 })).toBe(85));
  it("faixas do rótulo", () => {
    expect(healthLabel(80)).toBe("saudavel");
    expect(healthLabel(79)).toBe("atencao");
    expect(healthLabel(50)).toBe("atencao");
    expect(healthLabel(49)).toBe("critica");
    expect(healthLabel(null)).toBe("sem_dados");
  });
});
