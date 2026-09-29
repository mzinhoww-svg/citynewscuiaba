import { describe, expect, it } from "vitest";
import {
  assignVariant,
  experimentVersion,
  parseExperimentVersion,
  proportionTest,
  weightsValid,
} from "./experiments";
import {
  CONCENTRATION_ALERT,
  concentrationTop3,
  diversityIndex,
  scoreBreakdown,
  sharesOf,
  summarizeRecEvents,
  type RecEventRow,
} from "./metrics";
import { REC_V1 } from "./score";
import type { SourceSignals } from "./types";

/* P5-T7 · Recomendação: pesos, A/B e métricas do painel (tracking-plan §4–§6). */

describe("weightsValid", () => {
  it("aceita soma 1,00 ± 0,001 e recusa 0,99 mostrando a soma", () => {
    expect(weightsValid(REC_V1)).toEqual({ ok: true, sum: 1 });
    expect(weightsValid({ ...REC_V1, diversity: 0.04 })).toEqual({ ok: false, sum: 0.99 });
    expect(weightsValid({ ...REC_V1, diversity: 0.0505 }).ok).toBe(true);
    expect(weightsValid({ ...REC_V1, popularity: -0.1, diversity: 0.5 }).ok).toBe(false);
  });
});

describe("assignVariant", () => {
  const exp = { id: "3f2a9c1e-0000-4000-8000-00000000abcd", split: [50, 50] };
  it("é estável para o mesmo anonId e distribui pelos pesos", () => {
    const a = assignVariant("anon-1", exp);
    for (let i = 0; i < 20; i++) expect(assignVariant("anon-1", exp)).toBe(a);
    const counts = [0, 0];
    for (let i = 0; i < 2000; i++) counts[assignVariant(`anon-${i}`, exp)]!++;
    expect(counts[0]! / 2000).toBeGreaterThan(0.42);
    expect(counts[0]! / 2000).toBeLessThan(0.58);
  });
  it("respeita alocações desiguais e experimentos diferentes mudam a atribuição", () => {
    const skew = { id: exp.id, split: [90, 10] };
    let ones = 0;
    for (let i = 0; i < 2000; i++) ones += assignVariant(`anon-${i}`, skew);
    expect(ones / 2000).toBeLessThan(0.16);
    const other = { id: "aaaaaaaa-0000-4000-8000-000000000000", split: [50, 50] };
    const differs = Array.from({ length: 50 }, (_, i) => `anon-${i}`).some(
      (id) => assignVariant(id, exp) !== assignVariant(id, other),
    );
    expect(differs).toBe(true);
  });
  it("split vazio ou inválido cai na variante 0", () => {
    expect(assignVariant("x", { id: exp.id, split: [] })).toBe(0);
    expect(assignVariant("x", { id: exp.id, split: [0, 0] })).toBe(0);
  });
  it("rótulo de versão cabe em 20 caracteres e volta para o experimento", () => {
    const v = experimentVersion("rec-v1", exp.id, 1);
    expect(v.length).toBeLessThanOrEqual(20);
    expect(parseExperimentVersion(v)).toEqual({
      base: "rec-v1",
      experiment: "3f2a9c1e",
      variant: 1,
    });
    expect(parseExperimentVersion("rec-v1")).toBeNull();
  });
});

describe("proportionTest", () => {
  it("diferença grande é significativa; amostra pequena não", () => {
    const big = proportionTest({ n: 5000, k: 300 }, { n: 5000, k: 400 });
    expect(big.significant).toBe(true);
    expect(big.pValue).toBeLessThan(0.05);
    const small = proportionTest({ n: 20, k: 2 }, { n: 20, k: 3 });
    expect(small.significant).toBe(false);
    expect(proportionTest({ n: 0, k: 0 }, { n: 0, k: 0 })).toEqual({
      z: 0,
      pValue: 1,
      significant: false,
    });
  });
});

describe("diversidade e concentração", () => {
  it("diversityIndex([0.5, 0.5]) = 0.5 e concentração top-3", () => {
    expect(diversityIndex([0.5, 0.5])).toBeCloseTo(0.5, 10);
    expect(diversityIndex([1])).toBe(0);
    expect(diversityIndex([])).toBe(0);
    expect(concentrationTop3([0.1, 0.4, 0.2, 0.3])).toBeCloseTo(0.9, 10);
    expect(concentrationTop3([0.5, 0.5])).toBe(1);
    expect(sharesOf([3, 1])).toEqual([0.75, 0.25]);
    expect(sharesOf([])).toEqual([]);
  });
});

function row(p: Partial<RecEventRow>): RecEventRow {
  return {
    algoVersion: "rec-v1",
    name: "recommendation_clicked",
    list: null,
    reason: null,
    dismissReason: null,
    sourceSlug: null,
    personalization: false,
    account: false,
    n: 1,
    ...p,
  };
}

describe("summarizeRecEvents", () => {
  const rows: RecEventRow[] = [
    row({ name: "source_viewed", n: 100, personalization: true }),
    row({ name: "source_viewed", n: 100, account: true }),
    row({
      list: "recommended",
      reason: "local_popular",
      sourceSlug: "a",
      n: 30,
      personalization: true,
    }),
    row({ list: "recommended", reason: "diversity", sourceSlug: "b", n: 10 }),
    row({ list: "popular", reason: "regional_popular", sourceSlug: "a", n: 20 }),
    row({ list: "popular", reason: "regional_popular", sourceSlug: "c", n: 5 }),
    row({
      name: "recommendation_dismissed",
      list: "recommended",
      dismissReason: "already_know",
      n: 4,
    }),
    row({
      name: "recommendation_dismissed",
      list: "recommended",
      dismissReason: "hide_topic",
      n: 1,
    }),
  ];
  it("CTR por lista e razão, ocultação por motivo, diversidade, concentração e alerta", () => {
    const m = summarizeRecEvents(rows);
    expect(m.impressions).toBe(200);
    expect(m.clicks).toBe(65);
    expect(m.ctr).toBeCloseTo(0.325, 6);
    expect(m.byList.find((l) => l.list === "recommended")).toEqual({
      list: "recommended",
      clicks: 40,
      ctr: 0.2,
    });
    expect(m.byReason.find((r) => r.reason === "regional_popular")?.clicks).toBe(25);
    expect(m.dismissals).toBe(5);
    expect(m.hideRate).toBeCloseTo(5 / 65, 6);
    expect(m.byDismissReason).toEqual([
      { reason: "already_know", count: 4 },
      { reason: "hide_topic", count: 1 },
    ]);
    // Cliques por fonte: a = 50, b = 10, c = 5 → shares .769/.154/.077
    expect(m.diversity).toBeCloseTo(1 - (0.769 ** 2 + 0.154 ** 2 + 0.077 ** 2), 2);
    expect(m.concentrationTop3).toBe(1);
    expect(m.concentrationAlert).toBe(true);
    expect(CONCENTRATION_ALERT).toBe(0.5);
    // Personalização: 130 de 270 eventos com consentimento; contas: 100.
    expect(m.personalizationShare).toBeCloseTo(130 / 270, 6);
    expect(m.accounts).toBe(100);
    expect(m.anonymous).toBe(170);
  });
  it("sem eventos, tudo zero e sem alerta", () => {
    const m = summarizeRecEvents([]);
    expect(m.ctr).toBe(0);
    expect(m.diversity).toBe(0);
    expect(m.concentrationAlert).toBe(false);
    expect(m.byList).toEqual([]);
  });
  it("concentração top-3 acima de 0,5 com muitas fontes dispara o alerta; abaixo, não", () => {
    const spread = Array.from({ length: 10 }, (_, i) =>
      row({ sourceSlug: `s${i}`, list: "popular", reason: "x", n: 10 }),
    );
    expect(summarizeRecEvents(spread).concentrationAlert).toBe(false);
    const heavy = [...spread, row({ sourceSlug: "s0", list: "popular", reason: "x", n: 200 })];
    expect(summarizeRecEvents(heavy).concentrationAlert).toBe(true);
  });
});

describe("scoreBreakdown (Por que esta recomendação)", () => {
  const s: SourceSignals = {
    slug: "folha-do-cerrado",
    locality: "cuiaba",
    popularity: 0.8,
    individual: 0.6,
    recency: 0.5,
    engagement: 0.4,
    operational: 1,
    diversity: 0.2,
    trend: 0.3,
    followed: false,
    pinned: false,
    excluded: false,
    blocked: false,
    isNewForUser: false,
    localHighlight: false,
    verified: true,
  };
  it("com consentimento, cada componente contribui peso × sinal e soma o score", () => {
    const b = scoreBreakdown(s, REC_V1, true);
    expect(b.components.find((c) => c.key === "individual")?.contribution).toBeCloseTo(
      0.25 * 0.6,
      6,
    );
    expect(b.components.reduce((acc, c) => acc + c.contribution, 0)).toBeCloseTo(b.score, 6);
    expect(b.components[0]?.key).toBe("popularity");
  });
  it("sem consentimento, o individual pesa 0 e os demais são renormalizados (CLAUDE.md §5.7)", () => {
    const b = scoreBreakdown(s, REC_V1, false);
    const ind = b.components.find((c) => c.key === "individual");
    expect(ind?.weight).toBe(0);
    expect(ind?.contribution).toBe(0);
    expect(b.components.reduce((acc, c) => acc + c.weight, 0)).toBeCloseTo(1, 6);
  });
});
