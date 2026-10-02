/**
 * Métricas do painel de recomendação (P5-T7, tracking-plan §6): CTR por lista e por razão,
 * ocultação por motivo, diversidade (1 − Σ share²), concentração top-3 com alerta, % de
 * personalização ativa e anônimos × contas. Puro sobre linhas já agregadas pelo banco
 * (`rec_events_summary`, 0037). "Por que esta recomendação" decompõe o score por componente.
 */
import { effectiveWeights, WEIGHT_KEYS } from "./score";
import type { SourceSignals, WeightKey, Weights } from "./types";

/** Concentração top-3 acima disto dispara o alerta do painel. */
export const CONCENTRATION_ALERT = 0.5;

/** Índice de diversidade 1 − Σ shareᵢ² (0 = uma fonte só). */
export function diversityIndex(shares: number[]): number {
  if (shares.length === 0) return 0;
  const s = shares.reduce((acc, x) => acc + x * x, 0);
  return Math.max(0, Math.min(1, 1 - s));
}

/** Soma das três maiores fatias. */
export function concentrationTop3(shares: number[]): number {
  return [...shares]
    .sort((a, b) => b - a)
    .slice(0, 3)
    .reduce((acc, x) => acc + x, 0);
}

/** Contagens → fatias (soma 1). */
export function sharesOf(counts: number[]): number[] {
  const total = counts.reduce((s, x) => s + x, 0);
  return total > 0 ? counts.map((c) => c / total) : [];
}

/** Linha agregada de eventos de recomendação (uma por combinação). */
export interface RecEventRow {
  algoVersion: string;
  name: string;
  list: string | null;
  reason: string | null;
  dismissReason: string | null;
  sourceSlug: string | null;
  /** Consentimento de personalização no evento. */
  personalization: boolean;
  /** Evento de leitor com conta. */
  account: boolean;
  n: number;
}

export interface RecMetrics {
  /** Visualizações de fonte nas superfícies (denominador do CTR). */
  impressions: number;
  clicks: number;
  ctr: number;
  byList: { list: string; clicks: number; ctr: number }[];
  byReason: { reason: string; clicks: number; share: number }[];
  dismissals: number;
  /** Ocultações ÷ cliques em recomendação. */
  hideRate: number;
  byDismissReason: { reason: string; count: number }[];
  bySource: { slug: string; clicks: number; share: number }[];
  diversity: number;
  concentrationTop3: number;
  concentrationAlert: boolean;
  personalizationShare: number;
  anonymous: number;
  accounts: number;
}

const inc = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);
const sorted = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);

export function summarizeRecEvents(rows: RecEventRow[]): RecMetrics {
  let impressions = 0;
  let clicks = 0;
  let dismissals = 0;
  let personal = 0;
  let accounts = 0;
  let total = 0;
  const byList = new Map<string, number>();
  const byReason = new Map<string, number>();
  const byDismiss = new Map<string, number>();
  const bySource = new Map<string, number>();
  for (const r of rows) {
    total += r.n;
    if (r.personalization) personal += r.n;
    if (r.account) accounts += r.n;
    if (r.name === "source_viewed") impressions += r.n;
    if (r.name === "recommendation_clicked") {
      clicks += r.n;
      inc(byList, r.list ?? "—", r.n);
      inc(byReason, r.reason ?? "—", r.n);
      inc(bySource, r.sourceSlug ?? "—", r.n);
    }
    if (r.name === "recommendation_dismissed") {
      dismissals += r.n;
      inc(byDismiss, r.dismissReason ?? "—", r.n);
    }
  }
  const sourceShares = sharesOf([...bySource.values()]);
  const top3 = concentrationTop3(sourceShares);
  const sources = sorted(bySource);
  return {
    impressions,
    clicks,
    ctr: impressions > 0 ? clicks / impressions : 0,
    byList: sorted(byList).map(([list, c]) => ({
      list,
      clicks: c,
      ctr: impressions > 0 ? c / impressions : 0,
    })),
    byReason: sorted(byReason).map(([reason, c]) => ({
      reason,
      clicks: c,
      share: clicks > 0 ? c / clicks : 0,
    })),
    dismissals,
    hideRate: clicks > 0 ? dismissals / clicks : 0,
    byDismissReason: sorted(byDismiss).map(([reason, count]) => ({ reason, count })),
    bySource: sources.map(([slug, c]) => ({ slug, clicks: c, share: clicks > 0 ? c / clicks : 0 })),
    diversity: diversityIndex(sourceShares),
    concentrationTop3: top3,
    // Alerta só com mais de 3 fontes clicadas: com ≤ 3 a soma é sempre 1.
    concentrationAlert: clicks > 0 && top3 > CONCENTRATION_ALERT,
    personalizationShare: total > 0 ? personal / total : 0,
    anonymous: total - accounts,
    accounts,
  };
}

export interface ScoreComponent {
  key: WeightKey;
  /** Peso efetivo (renormalizado sem consentimento). */
  weight: number;
  signal: number;
  contribution: number;
}

export interface ScoreBreakdown {
  slug: string;
  score: number;
  personalization: boolean;
  components: ScoreComponent[];
}

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/**
 * Decomposição do score de uma fonte por componente (O17, "Por que esta recomendação"). Sem
 * consentimento, o individual pesa 0 e os demais são renormalizados (CLAUDE.md §5 regra 7).
 */
export function scoreBreakdown(
  s: SourceSignals,
  w: Weights,
  personalization: boolean,
): ScoreBreakdown {
  const ew = effectiveWeights(w, personalization);
  const components = WEIGHT_KEYS.map((key) => {
    const signal = clamp01(s[key]);
    return { key, weight: ew[key], signal, contribution: ew[key] * signal };
  });
  return {
    slug: s.slug,
    personalization,
    score: clamp01(components.reduce((acc, c) => acc + c.contribution, 0)),
    components,
  };
}
