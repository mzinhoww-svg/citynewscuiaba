import type { Database } from "@/lib/db/types";
import type { Venue, VenueRecord } from "./types";

/** Lugar fictício para testes (nomes inventados; nunca um estabelecimento real). */
export function venueRecord(over: Partial<VenueRecord> = {}): VenueRecord {
  return {
    name: "Padaria Pão Dourado",
    category: "padaria",
    subcategory: null,
    neighborhood: null,
    address: null,
    lat: -15.6014,
    lng: -56.0979,
    phone: null,
    website: null,
    instagram: null,
    hours: null,
    priceLevel: null,
    rating: null,
    ratingCount: null,
    ratingSource: null,
    tripadvisorRank: null,
    tripadvisorUrl: null,
    googleMapsUrl: null,
    googleType: null,
    googlePhoto: null,
    placeIds: {},
    sources: ["osm"],
    ...over,
  };
}

let seq = 0;

/** Lugar já gravado, com dados completos e duas fontes, para os testes de proposta. */
export function venue(over: Partial<Venue> = {}): Venue {
  seq += 1;
  return {
    ...venueRecord({
      name: `Padaria Teste ${seq}`,
      address: `Rua das Flores, ${seq}`,
      neighborhood: "Goiabeiras",
      phone: "+55 65 3000-0000",
      hours: "Mo-Sa 06:00-20:00",
      website: `https://padaria${seq}.example`,
      rating: 4.5,
      ratingCount: 500,
      ratingSource: "tripadvisor",
      placeIds: { osm: `node/${seq}`, tripadvisor: String(1000 + seq) },
      sources: ["osm", "tripadvisor"],
    }),
    id: `v${seq}`,
    slug: `padaria-teste-${seq}`,
    status: "active",
    dataUpdatedAt: "2026-10-01T12:00:00Z",
    ...over,
  };
}

/** Linha de `venues` fictícia (testes de mapeamento do banco). */
export function venueRow(
  over: Partial<Database["public"]["Tables"]["venues"]["Row"]> = {},
): Database["public"]["Tables"]["venues"]["Row"] {
  return {
    address: null,
    category: "padaria",
    created_at: "2026-10-01T00:00:00Z",
    data_sources: ["google"],
    data_updated_at: null,
    google_fetched_at: null,
    google_maps_url: null,
    google_photo_author: null,
    google_photo_author_uri: null,
    google_photo_name: null,
    google_primary_type: null,
    hours: null,
    id: "00000000-0000-4000-8000-000000000001",
    instagram: null,
    lat: null,
    lng: null,
    name: "Padaria Pão Dourado",
    neighborhood: null,
    phone: null,
    photo_checked_at: null,
    place_ids: { google: "ChIJ-teste-pao-dourado" },
    price_level: null,
    rating: null,
    rating_count: null,
    rating_source: null,
    rating_updated_at: null,
    slug: "padaria-pao-dourado-cuiaba",
    status: "active",
    status_reason: null,
    subcategory: null,
    tripadvisor_rank: null,
    tripadvisor_url: null,
    updated_at: "2026-10-01T00:00:00Z",
    website: null,
    ...over,
  };
}
