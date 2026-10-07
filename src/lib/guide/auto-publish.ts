import type { ListOrigin } from "./types";

/**
 * Publicação automática de lista (spec G4): só lista de modelo, com o mínimo de lugares
 * verificados, critério escrito, ao menos 1 fonte de dados por lugar (A-211) e sinal de qualidade
 * (nota, ranking ou menção) em pelo menos o mínimo de lugares. A foto não entra: lugar sem foto
 * aprovada usa o cartão tipográfico. Patrocinada, por link ou manual sempre passa por pessoa.
 */

export interface ListDraftItem {
  venueId: string;
  /** Existe nos provedores e foi conferido de novo (nunca só o nome de um texto colado). */
  verified: boolean;
  /** Fontes de dados distintas que sustentam o lugar. */
  sources: number;
  /** Tem nota, posição no ranking ou menção nas nossas matérias. */
  hasQualitySignal: boolean;
}

export interface ListDraft {
  origin: ListOrigin;
  criteria: string;
  sponsored: boolean;
  items: ListDraftItem[];
}

export type MissingForAutoPublish =
  "min_venues" | "criteria" | "sources" | "quality_signal" | "needs_human";

export const MIN_CRITERIA_CHARS = 40;
export const DEFAULT_MIN_VENUES = 5;
/** A-211: as listas são informativas; uma fonte de dados por lugar basta. */
export const MIN_SOURCES_PER_VENUE = 1;

export function canAutoPublish(
  list: ListDraft,
  minVenues = DEFAULT_MIN_VENUES,
): { ok: boolean; missing: MissingForAutoPublish[] } {
  const missing: MissingForAutoPublish[] = [];
  const unique = [...new Map(list.items.map((i) => [i.venueId, i])).values()];

  if (unique.filter((i) => i.verified).length < minVenues) missing.push("min_venues");
  if (list.criteria.trim().length < MIN_CRITERIA_CHARS) missing.push("criteria");
  if (unique.some((i) => i.sources < MIN_SOURCES_PER_VENUE) || unique.length === 0)
    missing.push("sources");
  if (unique.filter((i) => i.hasQualitySignal).length < minVenues) missing.push("quality_signal");
  if (list.sponsored || list.origin !== "template") missing.push("needs_human");

  return { ok: missing.length === 0, missing };
}
