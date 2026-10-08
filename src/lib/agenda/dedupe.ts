import { localDateKey } from "@/lib/format/date";
import type { NormalizedEvent } from "./types";

/** Palavras (mais de 2 letras) do título na chave de duplicidade. */
export const tokens = (key: string) =>
  new Set((key.split("|")[0] ?? "").split("-").filter((w) => w.length > 2));

/** Similaridade de Jaccard entre os títulos de duas chaves de duplicidade (0 a 1). */
export function titleSimilarity(keyA: string, keyB: string): number {
  const ta = tokens(keyA);
  const tb = tokens(keyB);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 ? inter / union : 0;
}

function similar(a: NormalizedEvent, b: NormalizedEvent): boolean {
  if (a.dedupeKey === b.dedupeKey) return true;
  if (localDateKey(a.startsAt) !== localDateKey(b.startsAt)) return false;
  if (a.venue.toLowerCase() !== b.venue.toLowerCase()) return false;
  return titleSimilarity(a.dedupeKey, b.dedupeKey) >= 0.6;
}

/**
 * Remove repetidos (mesmo título, dia e local, ou títulos muito parecidos no mesmo dia e local).
 * Fica o primeiro da lista; a ordem das fontes decide (oficial antes de organizador). Entre dois
 * parecidos, o de fonte que confirma (`confirms`) toma o lugar do que não confirma, exceto um
 * registro já guardado (`sourceId === ""`, manual ou de leitor), que sempre vence.
 */
export function dedupeEvents(list: readonly NormalizedEvent[]): NormalizedEvent[] {
  const kept: NormalizedEvent[] = [];
  for (const e of list) {
    const i = kept.findIndex((k) => similar(k, e));
    if (i < 0) kept.push(e);
    else if (e.confirms && !kept[i]?.confirms && kept[i]?.sourceId !== "") kept[i] = e;
  }
  return kept;
}
