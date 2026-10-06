import type { DataSource, PlaceIds, VenueRecord } from "./types";

/**
 * Mescla de lugares vindos de provedores diferentes: o mesmo lugar chega do OpenStreetMap, do
 * TripAdvisor e do site oficial com nomes e coordenadas um pouco diferentes. Função pura.
 */

const STOP = new Set([
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "a",
  "o",
  "the",
  "restaurante",
  "padaria",
  "cafeteria",
  "pizzaria",
  "hamburgueria",
  "churrascaria",
  "sorveteria",
  "lanchonete",
  "bar",
  "hotel",
  "cafe",
  "cafes",
  "ltda",
  "me",
]);

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Palavras que identificam o lugar (sem acento, sem artigos nem o tipo do negócio). */
export function nameTokens(name: string): string[] {
  const all = fold(name)
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
  const kept = all.filter((t) => !STOP.has(t));
  return kept.length > 0 ? kept : all;
}

export function normalizedName(name: string): string {
  return nameTokens(name).sort().join(" ");
}

function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((t) => sb.has(t)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

/** Semelhança de dois nomes, 0 a 1 (palavras em comum sobre palavras no total). */
export function nameSimilarity(a: string, b: string): number {
  return jaccard(nameTokens(a), nameTokens(b));
}

/** Distância em metros entre dois pontos (haversine). */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function host(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Raio em que dois pontos com nome parecido são o mesmo lugar. */
export const SAME_PLACE_METERS = 250;
const MIN_NAME_SIMILARITY = 0.75;
/** Raio para nomes em que um contém o outro ("Pão Dourado" e "Pão Dourado - Goiabeiras"). */
const CONTAINED_NAME_METERS = 100;

function nameContained(a: string[], b: string[]): boolean {
  const [small, big] = a.length <= b.length ? [new Set(a), new Set(b)] : [new Set(b), new Set(a)];
  return small.size >= 2 && [...small].every((t) => big.has(t));
}

type Matchable = Pick<VenueRecord, "name" | "lat" | "lng" | "placeIds" | "website" | "address">;

/** Mesmo lugar: id de provedor em comum, ou nome parecido e a mesma localização. */
export function isSameVenue(a: Matchable, b: Matchable): boolean {
  for (const k of Object.keys(a.placeIds) as (keyof PlaceIds)[]) {
    const x = a.placeIds[k];
    if (x && x === b.placeIds[k]) return true;
  }
  const ta = nameTokens(a.name);
  const tb = nameTokens(b.name);
  // Um nome contido no outro (o Google costuma acrescentar o bairro) vale como o mesmo lugar só
  // muito perto (100 m) e com pelo menos duas palavras em comum.
  if (
    nameContained(ta, tb) &&
    a.lat !== null &&
    a.lng !== null &&
    b.lat !== null &&
    b.lng !== null &&
    distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= CONTAINED_NAME_METERS
  )
    return true;
  if (jaccard(ta, tb) < MIN_NAME_SIMILARITY) return false;
  if (a.lat !== null && a.lng !== null && b.lat !== null && b.lng !== null) {
    return (
      distanceMeters({ lat: a.lat, lng: a.lng }, { lat: b.lat, lng: b.lng }) <= SAME_PLACE_METERS
    );
  }
  // Sem coordenada de um dos lados: precisa de outra prova (mesmo site ou mesmo endereço).
  const ha = host(a.website);
  if (ha && ha === host(b.website)) return true;
  const aa = a.address
    ? fold(a.address)
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : null;
  const ab = b.address
    ? fold(b.address)
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : null;
  return aa !== null && aa !== "" && aa === ab;
}

const unionSources = (a: DataSource[], b: DataSource[]): DataSource[] => [...new Set([...a, ...b])];

/** Precedência da nota (A-210): Google > TripAdvisor > manual; uma nota por lugar. */
function ratingRank(source: VenueRecord["ratingSource"]): number {
  return source === "google" ? 3 : source === "tripadvisor" ? 2 : source === "manual" ? 1 : 0;
}

/**
 * Junta `incoming` em `base`: o que já existe ganha, o que falta é preenchido, e a nota, a
 * contagem e o ranking vêm do dado novo (são os que envelhecem).
 */
export function mergeRecord(base: VenueRecord, incoming: VenueRecord): VenueRecord {
  const pick = <T>(a: T | null, b: T | null): T | null => (a !== null && a !== undefined ? a : b);
  const fresh =
    incoming.rating !== null &&
    incoming.ratingCount !== null &&
    (base.rating === null || ratingRank(incoming.ratingSource) >= ratingRank(base.ratingSource));
  return {
    name: base.name,
    category: base.category,
    subcategory: pick(base.subcategory, incoming.subcategory),
    neighborhood: pick(base.neighborhood, incoming.neighborhood),
    address: pick(base.address, incoming.address),
    lat: pick(base.lat, incoming.lat),
    lng: pick(base.lng, incoming.lng),
    phone: pick(base.phone, incoming.phone),
    website: pick(base.website, incoming.website),
    instagram: pick(base.instagram, incoming.instagram),
    hours: pick(base.hours, incoming.hours),
    priceLevel: pick(base.priceLevel, incoming.priceLevel),
    rating: fresh ? incoming.rating : base.rating,
    ratingCount: fresh ? incoming.ratingCount : base.ratingCount,
    ratingSource: fresh ? incoming.ratingSource : base.ratingSource,
    tripadvisorRank: incoming.tripadvisorRank ?? base.tripadvisorRank,
    tripadvisorUrl: pick(incoming.tripadvisorUrl, base.tripadvisorUrl),
    googleMapsUrl: pick(incoming.googleMapsUrl, base.googleMapsUrl),
    placeIds: { ...incoming.placeIds, ...base.placeIds },
    sources: unionSources(base.sources, incoming.sources),
  };
}

export interface MergeResult<E> {
  /** Registros novos (nenhum existente casou). */
  inserts: VenueRecord[];
  /** Existentes que receberam dados novos. */
  updates: { existing: E; record: VenueRecord }[];
}

/**
 * Encaixa cada registro novo num lugar existente (ou entre os próprios novos, quando o mesmo
 * lugar veio de dois provedores); o que não casa vira inserção.
 */
export function mergeVenueLists<E extends VenueRecord>(
  existing: readonly E[],
  incoming: readonly VenueRecord[],
): MergeResult<E> {
  const updates = new Map<number, VenueRecord>();
  const inserts: VenueRecord[] = [];
  for (const rec of incoming) {
    const ei = existing.findIndex((e, i) => isSameVenue(updates.get(i) ?? e, rec));
    if (ei >= 0) {
      const base = updates.get(ei) ?? existing[ei]!;
      updates.set(ei, mergeRecord(base, rec));
      continue;
    }
    const ni = inserts.findIndex((n) => isSameVenue(n, rec));
    if (ni >= 0) inserts[ni] = mergeRecord(inserts[ni]!, rec);
    else inserts.push(rec);
  }
  return {
    inserts,
    updates: [...updates.entries()].map(([i, record]) => ({ existing: existing[i]!, record })),
  };
}
