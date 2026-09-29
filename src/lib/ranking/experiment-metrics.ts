import { assignVariant, splitValid } from "./experiments";
import { concentrationTop3, diversityIndex, proportionTest, sharesOf } from "./metrics";

/**
 * Métricas por variante de um teste A/B (O18). Entrada: eventos agregados por id anônimo
 * pseudonimizado e fonte (`rec_variant_events`); a variante vem do mesmo sorteio que o portal
 * usa (`assignVariant`). Nada aqui identifica alguém: só contagens por variante.
 */
export interface ReaderSourceRow {
  anonId: string;
  sourceSlug: string | null;
  viewed: number;
  clicked: number;
  dismissed: number;
  firstAt: string;
  lastAt: string;
}

export interface VariantMetrics {
  variant: number;
  readers: number;
  viewed: number;
  clicked: number;
  dismissed: number;
  /** Cliques em recomendação ÷ fontes vistas (0 sem visualização). */
  ctr: number;
  /** Ocultações ÷ (cliques + ocultações). */
  dismissRate: number;
  /** Leitores que voltaram em outro dia (≥ 24 h entre o primeiro e o último evento) ÷ leitores. */
  returnRate: number;
  /** 1 − Σ share² dos cliques por fonte. */
  diversity: number;
  top3: number;
}

const DAY_MS = 86_400_000;

export function variantMetrics(
  rows: readonly ReaderSourceRow[],
  exp: { id: string; split: number[] },
): VariantMetrics[] {
  const n = splitValid(exp.split) ? exp.split.length : 0;
  const out: VariantMetrics[] = Array.from({ length: n }, (_, variant) => ({
    variant,
    readers: 0,
    viewed: 0,
    clicked: 0,
    dismissed: 0,
    ctr: 0,
    dismissRate: 0,
    returnRate: 0,
    diversity: 0,
    top3: 0,
  }));
  if (n === 0) return out;
  const readers = new Map<string, { v: number; first: number; last: number }>();
  const clicks: Map<string, number>[] = Array.from({ length: n }, () => new Map());
  for (const r of rows) {
    const v = assignVariant(r.anonId, exp);
    const m = out[v]!;
    m.viewed += r.viewed;
    m.clicked += r.clicked;
    m.dismissed += r.dismissed;
    if (r.sourceSlug && r.clicked > 0)
      clicks[v]!.set(r.sourceSlug, (clicks[v]!.get(r.sourceSlug) ?? 0) + r.clicked);
    const first = Date.parse(r.firstAt);
    const last = Date.parse(r.lastAt);
    const cur = readers.get(r.anonId);
    if (cur) {
      cur.first = Math.min(cur.first, first);
      cur.last = Math.max(cur.last, last);
    } else readers.set(r.anonId, { v, first, last });
  }
  const returned = new Array<number>(n).fill(0);
  for (const { v, first, last } of readers.values()) {
    out[v]!.readers += 1;
    if (last - first >= DAY_MS) returned[v]! += 1;
  }
  for (const m of out) {
    m.ctr = m.viewed > 0 ? m.clicked / m.viewed : 0;
    m.dismissRate = m.clicked + m.dismissed > 0 ? m.dismissed / (m.clicked + m.dismissed) : 0;
    m.returnRate = m.readers > 0 ? returned[m.variant]! / m.readers : 0;
    const shares = sharesOf([...clicks[m.variant]!.values()]);
    m.diversity = diversityIndex(shares);
    m.top3 = concentrationTop3(shares);
  }
  return out;
}

export interface ControlComparison {
  variant: number;
  /** Diferença relativa de CTR sobre o controle (variante 0); `null` sem base. */
  lift: number | null;
  z: number;
  significant: boolean;
}

/** Cada variante (menos o controle) contra a variante 0 no CTR, teste z de duas proporções. */
export function compareToControl(metrics: readonly VariantMetrics[]): ControlComparison[] {
  const control = metrics[0];
  if (!control) return [];
  return metrics.slice(1).map((m) => {
    const t = proportionTest(
      { n: control.viewed, x: control.clicked },
      { n: m.viewed, x: m.clicked },
    );
    return {
      variant: m.variant,
      lift: control.ctr > 0 ? m.ctr / control.ctr - 1 : null,
      z: t.z,
      significant: t.significant,
    };
  });
}
