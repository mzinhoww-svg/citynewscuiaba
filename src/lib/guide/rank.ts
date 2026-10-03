/**
 * Ranking da lista e ordem do índice. A ordem dos lugares vem só da pontuação: nenhum campo de
 * patrocínio entra aqui (Review Focus 5, spec G5). Desempate estável por nome e depois por id.
 */

export interface ScoredVenue {
  venueId: string;
  name: string;
  score: number;
  breakdown: Record<string, number>;
}

export type RankedVenue<T extends ScoredVenue = ScoredVenue> = T & { position: number };

const collator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function rankList<T extends ScoredVenue>(
  items: readonly T[],
  take: number,
): RankedVenue<T>[] {
  if (!Number.isFinite(take) || take <= 0) return [];
  return [...items]
    .sort(
      (a, b) =>
        b.score - a.score ||
        collator.compare(a.name, b.name) ||
        (a.venueId < b.venueId ? -1 : a.venueId > b.venueId ? 1 : 0),
    )
    .slice(0, Math.floor(take))
    .map((x, i) => ({ ...x, position: i + 1 }));
}

export interface IndexList {
  slug: string;
  publishedAt: string;
  sponsored: boolean;
}

/**
 * Índice `/guia-cuiaba`: editoriais por data (mais nova primeiro) e patrocinadas num grupo à
 * parte, depois das editoriais. A presença de uma patrocinada nunca desloca uma editorial.
 */
export function orderIndexLists<T extends IndexList>(
  lists: readonly T[],
): { editorial: T[]; sponsored: T[] } {
  const byDate = (a: T, b: T) =>
    b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug);
  return {
    editorial: lists.filter((l) => !l.sponsored).sort(byDate),
    sponsored: lists.filter((l) => l.sponsored).sort(byDate),
  };
}
