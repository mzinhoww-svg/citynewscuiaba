/**
 * Pontuação de um lugar (spec §4): nota ponderada pela contagem de avaliações, posição no ranking
 * do TripAdvisor, menções locais nas nossas matérias e completude dos dados. Função pura.
 *
 * Os quatro sinais valem de 0 a 1 e os pesos são normalizados, de modo que a pontuação final fica
 * em 0 a 100 e dobrar todos os pesos não muda nada. Sinal ausente vale zero, nunca "neutro":
 * lugar sem dados não ganha de lugar com dados.
 */

export interface Weights {
  rating: number;
  rank: number;
  mentions: number;
  completeness: number;
}

export const DEFAULT_WEIGHTS: Weights = {
  rating: 0.45,
  rank: 0.25,
  mentions: 0.15,
  completeness: 0.15,
};

/** Campos que contam na completude; o endereço vale mais (sem ele o leitor não chega ao lugar). */
export const COMPLETENESS_FIELDS = [
  "address",
  "coordinates",
  "neighborhood",
  "phone",
  "hours",
  "website",
] as const;
export type CompletenessField = (typeof COMPLETENESS_FIELDS)[number];

const FIELD_WEIGHT: Record<CompletenessField, number> = {
  address: 3,
  coordinates: 1,
  neighborhood: 1,
  phone: 1,
  hours: 1,
  website: 1,
};

export interface VenueSignals {
  /** Nota média (0 a 5) e quantas avaliações a sustentam. */
  rating: number | null;
  ratingCount: number | null;
  /** Posição no ranking local do TripAdvisor (1 = melhor). */
  tripadvisorRank: number | null;
  /** Nossas matérias que citam o lugar. */
  localMentions: number;
  fields: Partial<Record<CompletenessField, boolean>>;
}

export interface Score {
  /** 0 a 100, duas casas. */
  score: number;
  /** Pontos de cada sinal; somam `score`. */
  breakdown: Record<keyof Weights, number>;
}

/**
 * Média a priori e peso (em avaliações) do ajuste bayesiano da nota. O peso alto puxa para 4,0 a
 * nota de quem tem poucas avaliações (A-213: casa conhecida à frente de nota alta com poucas).
 */
const PRIOR_MEAN = 4;
const PRIOR_WEIGHT = 300;
/** Parte da nota que vem do volume de avaliações (log, cheio em 10 mil), A-213. */
const POPULARITY_SHARE = 0.3;
const POPULARITY_CAP = 10_000;
/** Ranking: 1 vale 1 e a nota decai em log até 0 na posição 500. */
const RANK_HORIZON = 500;
/** Menções: 8 ou mais já dão o máximo. */
const MENTIONS_CAP = 8;

const clamp01 = (x: number) => (Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0);
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Normaliza pesos para somar 1; negativos viram 0 e tudo zero volta ao padrão. */
export function normalizeWeights(w: Weights): Weights {
  const pos = (x: number) => (Number.isFinite(x) && x > 0 ? x : 0);
  const sum = pos(w.rating) + pos(w.rank) + pos(w.mentions) + pos(w.completeness);
  const src = sum > 0 ? w : DEFAULT_WEIGHTS;
  const total = sum > 0 ? sum : 1;
  return {
    rating: pos(src.rating) / total,
    rank: pos(src.rank) / total,
    mentions: pos(src.mentions) / total,
    completeness: pos(src.completeness) / total,
  };
}

/** Fração (0 a 1) dos campos presentes, ponderada. */
export function completenessOf(fields: Partial<Record<CompletenessField, boolean>>): number {
  let have = 0;
  let total = 0;
  for (const f of COMPLETENESS_FIELDS) {
    total += FIELD_WEIGHT[f];
    if (fields[f]) have += FIELD_WEIGHT[f];
  }
  return total === 0 ? 0 : have / total;
}

function ratingComponent(rating: number | null, count: number | null): number {
  if (rating === null || !Number.isFinite(rating) || rating < 0 || rating > 5) return 0;
  if (count === null || !Number.isFinite(count) || count <= 0) return 0;
  const bayes = (count * rating + PRIOR_WEIGHT * PRIOR_MEAN) / (count + PRIOR_WEIGHT);
  const quality = clamp01((bayes - 1) / 4);
  const popularity = clamp01(Math.log10(1 + count) / Math.log10(POPULARITY_CAP));
  return (1 - POPULARITY_SHARE) * quality + POPULARITY_SHARE * popularity;
}

function rankComponent(rank: number | null): number {
  if (rank === null || !Number.isFinite(rank) || rank < 1) return 0;
  return clamp01(1 - Math.log(rank) / Math.log(RANK_HORIZON));
}

function mentionsComponent(n: number): number {
  if (!Number.isFinite(n) || n <= 0) return 0;
  return clamp01(Math.log(1 + n) / Math.log(1 + MENTIONS_CAP));
}

export function scoreVenue(v: VenueSignals, weights: Weights): Score {
  const w = normalizeWeights(weights);
  const parts: Record<keyof Weights, number> = {
    rating: 100 * w.rating * ratingComponent(v.rating, v.ratingCount),
    rank: 100 * w.rank * rankComponent(v.tripadvisorRank),
    mentions: 100 * w.mentions * mentionsComponent(v.localMentions),
    completeness: 100 * w.completeness * completenessOf(v.fields),
  };
  const total = parts.rating + parts.rank + parts.mentions + parts.completeness;
  return {
    score: round2(Math.min(100, total)),
    breakdown: {
      rating: round2(parts.rating),
      rank: round2(parts.rank),
      mentions: round2(parts.mentions),
      completeness: round2(parts.completeness),
    },
  };
}
