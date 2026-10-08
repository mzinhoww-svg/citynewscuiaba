/**
 * Tipos do Guia Cuiabá (spec 2026-10-03-guia-cuiaba-listas-design.md). Nada aqui conhece banco,
 * rede ou framework: o domínio é puro e as bordas (provedores, banco, telas) importam daqui.
 */

/** Origem de um dado do lugar; vira a linha "Dados: ..." na tela pública. */
export const DATA_SOURCES = ["google", "osm", "tripadvisor", "site", "wikidata", "manual"] as const;
export type DataSource = (typeof DATA_SOURCES)[number];

export type VenueStatus = "active" | "suspended" | "inactive";

/** Identificadores do lugar em cada provedor (`venues.place_ids`). */
export interface PlaceIds {
  /** Place ID da Places API (New); o único dado do Google guardado sem prazo. */
  google?: string;
  /** `node/123`, `way/456` ou `relation/789`. */
  osm?: string;
  tripadvisor?: string;
  wikidata?: string;
}

/**
 * Lugar como os provedores o devolvem e como o banco o guarda (sem id). Nunca carrega texto de
 * avaliação: só nota, contagem e posição (spec R1).
 */
export interface VenueRecord {
  name: string;
  /** Categoria do Guia (`padaria`, `restaurante`, ...), ver `categories.ts`. */
  category: string;
  /** Cozinha ou subtipo (`italiana`, `japonesa`). */
  subcategory: string | null;
  neighborhood: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  /** Horário como a fonte informa (ex.: `Mo-Sa 07:00-19:00`). */
  hours: string | null;
  /** 1 a 4. */
  priceLevel: number | null;
  rating: number | null;
  ratingCount: number | null;
  ratingSource: "tripadvisor" | "google" | "manual" | null;
  tripadvisorRank: number | null;
  tripadvisorUrl: string | null;
  /** Link do lugar no Google Maps (atribuição exigida pelos termos; vale 30 dias). */
  googleMapsUrl: string | null;
  /** `primaryType` do lugar no Google (`bakery`, `hotel`); confere a categoria (A-210). */
  googleType: string | null;
  placeIds: PlaceIds;
  /** Fontes que trouxeram dados para este registro. */
  sources: DataSource[];
}

export interface Venue extends VenueRecord {
  id: string;
  slug: string;
  status: VenueStatus;
  dataUpdatedAt: string | null;
}

export type ListStatus = "proposal" | "draft" | "published" | "suspended" | "discarded";
export type ListOrigin = "template" | "link" | "manual";
export type SponsorKind = "citynews" | "partner";

/** Modelo do catálogo (`guide_templates`): categoria × bairro × cozinha. */
export interface GuideTemplate {
  slug: string;
  /** Ex.: "As 5 melhores padarias de Cuiabá". */
  title: string;
  /** Substantivo no plural para os textos ("padarias"). */
  noun?: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  take: number;
  minVenues: number;
}

/** Item de uma lista (posição e pontuação já calculadas). */
export interface GuideItem {
  position: number;
  venueId: string;
  score: number;
  breakdown: Record<string, number>;
  editorNote: string | null;
}

/** Lista como proposta: o que o motor entrega antes de gravar. */
export interface ListProposal {
  origin: ListOrigin;
  title: string;
  slug: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  criteria: string;
  take: number;
  templateSlug: string | null;
  items: GuideItem[];
  /** Fontes de dados usadas pelos lugares da lista (linha "Dados: ..."). */
  dataSources: DataSource[];
}
