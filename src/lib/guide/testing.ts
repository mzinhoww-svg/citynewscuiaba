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
      ratingCount: 200,
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
