import { describe, expect, it } from "vitest";
import { assignVariant, splitValid } from "./experiments";
import {
  CONCENTRATION_ALERT,
  concentrationAlert,
  concentrationTop3,
  diversityIndex,
  proportionTest,
  sharesOf,
  weightsValid,
} from "./metrics";
import { REC_V1 } from "./score";

describe("assignVariant", () => {
  const exp = { id: "exp-a", split: [0.5, 0.5] };
  it("é estável para o mesmo id e o mesmo experimento", () => {
    const id = "7f0c2f3e-9d6a-4c1e-8a55-0d8f5f1b2a10";
    const first = assignVariant(id, exp);
    for (let i = 0; i < 20; i++) expect(assignVariant(id, exp)).toBe(first);
  });
  it("respeita a divisão e devolve sempre um índice válido", () => {
    const split = [0.2, 0.3, 0.5];
    const counts = [0, 0, 0];
    for (let i = 0; i < 6000; i++) {
      const v = assignVariant(`anon-${i}`, { id: "exp-b", split });
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(3);
      counts[v]! += 1;
    }
    split.forEach((p, i) => expect(Math.abs(counts[i]! / 6000 - p)).toBeLessThan(0.04));
  });
  it("experimentos diferentes sorteiam de forma independente", () => {
    const same = Array.from({ length: 400 }, (_, i) => `anon-${i}`).filter(
      (a) =>
        assignVariant(a, { id: "x1", split: [0.5, 0.5] }) ===
        assignVariant(a, { id: "x2", split: [0.5, 0.5] }),
    ).length;
    expect(same).toBeGreaterThan(140);
    expect(same).toBeLessThan(260);
  });
  it("divisão inválida cai na variante 0 (controle)", () => {
    expect(assignVariant("a", { id: "e", split: [] })).toBe(0);
    expect(assignVariant("a", { id: "e", split: [0.9, 0.9] })).toBe(0);
  });
  it("splitValid exige soma 1 ±0,001 e valores positivos", () => {
    expect(splitValid([0.5, 0.5])).toBe(true);
    expect(splitValid([0.34, 0.33, 0.33])).toBe(true);
    expect(splitValid([0.5, 0.4])).toBe(false);
    expect(splitValid([1])).toBe(false);
    expect(splitValid([1.2, -0.2])).toBe(false);
  });
});

describe("diversidade e concentração", () => {
  it("diversityIndex([0,5; 0,5]) = 0,5", () => {
    expect(diversityIndex([0.5, 0.5])).toBeCloseTo(0.5, 10);
  });
  it("uma fonte só = 0; quatro iguais = 0,75", () => {
    expect(diversityIndex([1])).toBe(0);
    expect(diversityIndex([0.25, 0.25, 0.25, 0.25])).toBeCloseTo(0.75, 10);
    expect(diversityIndex([])).toBe(0);
  });
  it("concentrationTop3 soma as três maiores fatias", () => {
    expect(concentrationTop3([0.1, 0.4, 0.2, 0.05, 0.25])).toBeCloseTo(0.85, 10);
    expect(concentrationTop3([0.6, 0.4])).toBeCloseTo(1, 10);
    expect(concentrationTop3([])).toBe(0);
  });
  it("alerta de concentração quando top-3 > 0,5", () => {
    expect(CONCENTRATION_ALERT).toBe(0.5);
    expect(concentrationAlert([0.3, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(true);
    expect(concentrationAlert([0.2, 0.15, 0.15, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(false);
    expect(concentrationAlert([0.2, 0.2, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1])).toBe(false);
  });
  it("sharesOf normaliza contagens e ignora negativos", () => {
    expect(sharesOf([2, 2, 4])).toEqual([0.25, 0.25, 0.5]);
    expect(sharesOf([0, 0])).toEqual([0, 0]);
    expect(sharesOf([-1, 1])).toEqual([0, 1]);
  });
});

describe("weightsValid", () => {
  it("rec-v1 é válido e soma 1", () => {
    const r = weightsValid(REC_V1);
    expect(r.ok).toBe(true);
    expect(r.sum).toBeCloseTo(1, 10);
  });
  it("pesos que somam 0,99 → ok: false, sum: 0,99", () => {
    expect(weightsValid({ ...REC_V1, popularity: 0.34 })).toEqual({ ok: false, sum: 0.99 });
  });
  it("tolera ±0,001 e recusa negativos", () => {
    expect(weightsValid({ ...REC_V1, popularity: 0.3505 }).ok).toBe(true);
    expect(weightsValid({ ...REC_V1, popularity: 0.36 }).ok).toBe(false);
    expect(weightsValid({ ...REC_V1, popularity: 0.45, diversity: -0.05 }).ok).toBe(false);
  });
});

describe("proportionTest", () => {
  it("sem amostra não há significância", () => {
    expect(proportionTest({ n: 0, x: 0 }, { n: 100, x: 10 }).significant).toBe(false);
  });
  it("diferença grande com amostra grande é significativa", () => {
    const r = proportionTest({ n: 2000, x: 200 }, { n: 2000, x: 300 });
    expect(r.significant).toBe(true);
    expect(r.z).toBeGreaterThan(1.96);
  });
  it("diferença pequena não é", () => {
    expect(proportionTest({ n: 100, x: 10 }, { n: 100, x: 12 }).significant).toBe(false);
  });
});
