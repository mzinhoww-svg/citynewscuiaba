import type { AggregatedView } from "@/lib/db/queries/types";

/** Coluna de um veículo em "Comparar coberturas" (P16). */
export interface CoverageColumnData {
  slug: string;
  name: string;
  count: number;
  latest: AggregatedView;
  /** Horas (inteiras) depois da primeira publicação do assunto; 0 = foi o primeiro. */
  hoursAfterFirst: number;
}

const time = (iso: string | null): number => (iso ? Date.parse(iso) : Number.NaN);

/**
 * Quem cobriu o assunto e quem não cobriu, a partir dos itens agregados dele. Ordem: primeira
 * publicação de cada veículo (quem publicou antes vem antes); sem data, no fim.
 */
export function buildCoverage(
  items: AggregatedView[],
  sources: { slug: string; name: string }[],
): { covered: CoverageColumnData[]; missing: { slug: string; name: string }[] } {
  const by = new Map<string, AggregatedView[]>();
  for (const i of items) by.set(i.sourceSlug, [...(by.get(i.sourceSlug) ?? []), i]);
  const firstAll = Math.min(
    ...items.map((i) => time(i.publishedAt)).filter((t) => !Number.isNaN(t)),
  );
  const covered = [...by.entries()].map(([slug, list]) => {
    const dated = list.filter((i) => !Number.isNaN(time(i.publishedAt)));
    const first = Math.min(...dated.map((i) => time(i.publishedAt)));
    const latest =
      [...dated].sort((a, b) => time(b.publishedAt) - time(a.publishedAt))[0] ?? list[0]!;
    const hours =
      Number.isFinite(first) && Number.isFinite(firstAll)
        ? Math.floor((first - firstAll) / 3_600_000)
        : 0;
    return {
      slug,
      name: list[0]!.sourceName,
      count: list.length,
      latest,
      hoursAfterFirst: hours,
      first: Number.isFinite(first) ? first : Number.POSITIVE_INFINITY,
    };
  });
  covered.sort((a, b) => a.first - b.first || a.slug.localeCompare(b.slug));
  const missing = sources.filter((s) => !by.has(s.slug));
  return {
    covered: covered.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: c.count,
      latest: c.latest,
      hoursAfterFirst: c.hoursAfterFirst,
    })),
    missing,
  };
}

/** Assunto mais ativo para comparar: ao menos 2 veículos; mais veículos, depois o mais recente. */
export function pickActiveTopic<T extends { sourceCount: number; updatedAt: string }>(
  topics: T[],
): T | null {
  const eligible = topics.filter((t) => t.sourceCount >= 2);
  eligible.sort(
    (a, b) => b.sourceCount - a.sourceCount || Date.parse(b.updatedAt) - Date.parse(a.updatedAt),
  );
  return eligible[0] ?? null;
}
