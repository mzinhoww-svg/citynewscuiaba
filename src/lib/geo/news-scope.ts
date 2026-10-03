import { findPlace, normalizePlace, resolveNeighborhood, type Locality } from "./neighborhoods";

/**
 * Escopo da notícia para um portal regional (AUT-T3, A15): `cuiaba` (Cuiabá e Várzea Grande, a
 * região metropolitana que o portal cobre), `mt` (outro município ou o estado) ou `national`.
 * Urgência e destaque só para `cuiaba` e `mt`, ou para comoção nacional.
 */
export type NewsScope = "cuiaba" | "mt" | "national";

/** Etiqueta que o `classify` põe em notícia nacional de comoção (A15). */
export const NATIONAL_COMMOTION_TAG = "comocao-nacional";

export interface NewsScopeInput {
  /** Bairros do dicionário citados nos itens. */
  neighborhoods: readonly string[];
  /** Município apontado pelo localizador (`locate`); `null` quando não houve resposta. */
  municipality: Locality | string | null;
  /** Localidade cadastrada da fonte; `br` e `nacional` valem o mesmo. */
  sourceLocality: Locality | "br";
  /** Título e resumo da matéria. */
  text: string;
}

const METRO = new Set(["cuiaba", "varzea-grande"]);

/** Menção ao estado no texto ("Mato Grosso", "governo de MT"). */
const MENTIONS_MT = /(^| )(mato grosso|mt)( |$)/;

/**
 * Escopo da notícia, do mais específico para o menos: bairro do dicionário, município do
 * localizador, lugares citados no texto e, por último, a localidade da fonte. Fonte nacional sem
 * nenhum lugar de Cuiabá ou de Mato Grosso no texto é `national`.
 */
export function newsScope(input: NewsScopeInput): NewsScope {
  if (input.neighborhoods.some((n) => METRO.has(resolveNeighborhood(n)?.municipality ?? ""))) {
    return "cuiaba";
  }
  const m = input.municipality;
  if (m !== null && METRO.has(m)) return "cuiaba";
  if (m === "mt") return "mt";
  // "nacional" do localizador (ou o valor de reserva da fonte) não decide sozinho: o texto pode
  // citar Cuiabá ou Mato Grosso. Sem lugar local no texto, a notícia segue nacional.
  const explicitNational = m === "nacional";

  const place = findPlace(input.text);
  if (place.neighborhood || (place.municipality !== null && METRO.has(place.municipality)))
    return "cuiaba";
  if (place.municipality === "mt" || MENTIONS_MT.test(normalizePlace(input.text))) return "mt";

  if (explicitNational) return "national";
  if (METRO.has(input.sourceLocality)) return "cuiaba";
  if (input.sourceLocality === "mt") return "mt";
  return "national";
}

/** Valor de `articles.news_scope` (texto no banco) como `NewsScope`; desconhecido vira `null`. */
export function asScope(v: string | null | undefined): NewsScope | null {
  return v === "cuiaba" || v === "mt" || v === "national" ? v : null;
}

/** O mais local entre várias localidades (itens de um assunto): metrô > estado > nacional. */
export function mostLocal(localities: readonly string[]): Locality | null {
  if (localities.some((l) => METRO.has(l))) return "cuiaba";
  if (localities.includes("mt")) return "mt";
  if (localities.some((l) => l === "nacional" || l === "br")) return "nacional";
  return null;
}

/**
 * Pode ser urgente ou destaque? Notícia local ou regional sempre; nacional só com comoção
 * nacional (A15).
 */
export function isEligibleForFeature(a: {
  newsScope: NewsScope | null | undefined;
  nationalCommotion: boolean;
}): boolean {
  return a.newsScope !== "national" || a.nationalCommotion;
}
