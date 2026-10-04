import { describe, expect, it } from "vitest";
import {
  COMPLETENESS_FIELDS,
  DEFAULT_WEIGHTS,
  completenessOf,
  normalizeWeights,
  scoreVenue,
  type VenueSignals,
} from "./score";

const FULL = Object.fromEntries(
  COMPLETENESS_FIELDS.map((f) => [f, true]),
) as VenueSignals["fields"];

const base = (over: Partial<VenueSignals> = {}): VenueSignals => ({
  rating: 4.5,
  ratingCount: 300,
  tripadvisorRank: null,
  localMentions: 0,
  fields: FULL,
  ...over,
});

describe("scoreVenue", () => {
  it("nota alta com poucas avaliações pontua menos que nota menor com muitas", () => {
    const few = scoreVenue(base({ rating: 4.8, ratingCount: 20 }), DEFAULT_WEIGHTS);
    const many = scoreVenue(base({ rating: 4.6, ratingCount: 900 }), DEFAULT_WEIGHTS);
    expect(many.score).toBeGreaterThan(few.score);
  });

  it("a mesma nota com mais avaliações nunca pontua menos", () => {
    const a = scoreVenue(base({ rating: 4.4, ratingCount: 10 }), DEFAULT_WEIGHTS).score;
    const b = scoreVenue(base({ rating: 4.4, ratingCount: 100 }), DEFAULT_WEIGHTS).score;
    const c = scoreVenue(base({ rating: 4.4, ratingCount: 1000 }), DEFAULT_WEIGHTS).score;
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeGreaterThanOrEqual(b);
  });

  it("posição no ranking do TripAdvisor melhora a pontuação, e quanto melhor a posição, mais", () => {
    const none = scoreVenue(base(), DEFAULT_WEIGHTS).score;
    const r10 = scoreVenue(base({ tripadvisorRank: 10 }), DEFAULT_WEIGHTS).score;
    const r1 = scoreVenue(base({ tripadvisorRank: 1 }), DEFAULT_WEIGHTS).score;
    expect(r10).toBeGreaterThan(none);
    expect(r1).toBeGreaterThan(r10);
  });

  it("menções nas nossas matérias somam, com retorno decrescente", () => {
    const m0 = scoreVenue(base({ localMentions: 0 }), DEFAULT_WEIGHTS).score;
    const m1 = scoreVenue(base({ localMentions: 1 }), DEFAULT_WEIGHTS).score;
    const m3 = scoreVenue(base({ localMentions: 3 }), DEFAULT_WEIGHTS).score;
    const m30 = scoreVenue(base({ localMentions: 30 }), DEFAULT_WEIGHTS).score;
    expect(m1).toBeGreaterThan(m0);
    expect(m3).toBeGreaterThan(m1);
    expect(m30 - m3).toBeLessThan(m3 - m0);
    expect(m30).toBeLessThanOrEqual(100);
  });

  it("completude penaliza lugar sem endereço mais que sem site", () => {
    const full = scoreVenue(base(), DEFAULT_WEIGHTS).score;
    const noSite = scoreVenue(base({ fields: { ...FULL, website: false } }), DEFAULT_WEIGHTS).score;
    const noAddress = scoreVenue(
      base({ fields: { ...FULL, address: false } }),
      DEFAULT_WEIGHTS,
    ).score;
    expect(noSite).toBeLessThan(full);
    expect(noAddress).toBeLessThan(noSite);
  });

  it("sem nota nem ranking esses sinais valem zero, nunca neutro", () => {
    const r = scoreVenue(base({ rating: null, ratingCount: null }), DEFAULT_WEIGHTS);
    expect(r.breakdown.rating).toBe(0);
    expect(r.breakdown.rank).toBe(0);
  });

  it("o detalhamento soma a pontuação e fica em 0 a 100", () => {
    const r = scoreVenue(
      base({ tripadvisorRank: 2, localMentions: 4, rating: 4.9, ratingCount: 2000 }),
      DEFAULT_WEIGHTS,
    );
    const sum = Object.values(r.breakdown).reduce((s, x) => s + x, 0);
    expect(r.score).toBeCloseTo(sum, 1);
    expect(r.score).toBeGreaterThan(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it.each([
    ["nota fora da escala", { rating: 7 }],
    ["nota negativa", { rating: -1 }],
    ["contagem negativa", { ratingCount: -5 }],
    ["ranking zero", { tripadvisorRank: 0 }],
    ["menções NaN", { localMentions: Number.NaN }],
  ] as const)("entrada inválida não quebra nem passa de 100: %s", (_n, over) => {
    const r = scoreVenue(base(over as Partial<VenueSignals>), DEFAULT_WEIGHTS);
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it("pesos são normalizados: dobrar todos os pesos não muda a pontuação", () => {
    const s = base({ tripadvisorRank: 3, localMentions: 2 });
    const a = scoreVenue(s, DEFAULT_WEIGHTS).score;
    const doubled = {
      rating: DEFAULT_WEIGHTS.rating * 2,
      rank: DEFAULT_WEIGHTS.rank * 2,
      mentions: DEFAULT_WEIGHTS.mentions * 2,
      completeness: DEFAULT_WEIGHTS.completeness * 2,
    };
    expect(scoreVenue(s, doubled).score).toBeCloseTo(a, 5);
  });
});

describe("normalizeWeights", () => {
  it("soma 1 e volta ao padrão quando todos os pesos são zero", () => {
    const n = normalizeWeights({ rating: 3, rank: 1, mentions: 1, completeness: 0 });
    expect(n.rating + n.rank + n.mentions + n.completeness).toBeCloseTo(1, 10);
    expect(normalizeWeights({ rating: 0, rank: 0, mentions: 0, completeness: 0 })).toEqual(
      normalizeWeights(DEFAULT_WEIGHTS),
    );
    expect(normalizeWeights({ ...DEFAULT_WEIGHTS, rank: -4 }).rank).toBe(0);
  });
});

describe("completenessOf", () => {
  it("fração dos campos presentes, com endereço valendo mais", () => {
    expect(completenessOf(FULL)).toBe(1);
    expect(completenessOf({})).toBe(0);
    expect(completenessOf({ ...FULL, address: false })).toBeLessThan(
      completenessOf({ ...FULL, website: false }),
    );
  });
});
