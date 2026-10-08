import type { HttpFetch } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import {
  categoryBySlug,
  cuisineBySlug,
  googleIncludedType,
  googleTypeMatches,
} from "../categories";
import type { GooglePhotoRef, VenueRecord } from "../types";
import type { ProviderError, VenueProvider, VenueQuery } from "./types";

/**
 * Google Places API (New), A-210. A chave vem só do ambiente (`GOOGLE_PLACES_API_KEY`) e vai no
 * cabeçalho `X-Goog-Api-Key`: nunca na URL, em erro ou em log. Pedimos só os campos do Guia (a
 * máscara define o custo); texto de avaliação nunca é lido (G3, R1). Da foto principal (A-212)
 * guardamos só a referência (`places/{id}/photos/{ref}`) e o crédito do autor; o arquivo nunca é
 * guardado, a rota `/api/guia/foto/[slug]` busca e repassa. Os termos do Google permitem guardar o
 * dado por 30 dias; só o Place ID fica sem prazo (ver `guide_expire_google`).
 */

export const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1";
const CENTER = { latitude: -15.6014, longitude: -56.0979 };
const RADIUS_M = 25000;
const MAX_PAGES = 3;
const PLACE_FIELDS = [
  "id",
  "displayName",
  "formattedAddress",
  "location",
  "rating",
  "userRatingCount",
  "nationalPhoneNumber",
  "websiteUri",
  "regularOpeningHours.weekdayDescriptions",
  "priceLevel",
  "googleMapsUri",
  "addressComponents",
  "primaryType",
  "photos",
];
const SEARCH_MASK = [...PLACE_FIELDS.map((f) => `places.${f}`), "nextPageToken"].join(",");
const DETAILS_MASK = PLACE_FIELDS.join(",");

/**
 * Chave do ambiente: `GOOGLE_PLACES_API_KEY` ou, na falta dela, `GOOGLE_PLACES_KEY` (nome com que a
 * chave foi cadastrada na Vercel). Vazia conta como ausente.
 */
export function googlePlacesKey(env: Record<string, string | undefined>): string | undefined {
  return env.GOOGLE_PLACES_API_KEY?.trim() || env.GOOGLE_PLACES_KEY?.trim() || undefined;
}

export interface GooglePlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  rating?: number;
  userRatingCount?: number;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  priceLevel?: string;
  googleMapsUri?: string;
  addressComponents?: { longText?: string; types?: string[] }[];
  primaryType?: string;
  photos?: {
    name?: string;
    authorAttributions?: { displayName?: string; uri?: string }[];
  }[];
}

/** Nome de foto da Places API (New): `places/{placeId}/photos/{ref}`, sem barra, ponto ou query. */
export const GOOGLE_PHOTO_NAME = /^places\/[A-Za-z0-9_-]{10,300}\/photos\/[A-Za-z0-9_-]{1,2000}$/;

/** Primeira foto do lugar com o autor (exigido pelos termos); nome fora do formato vira `null`. */
export function googlePhotoOf(p: GooglePlace): GooglePhotoRef | null {
  const first = p.photos?.[0];
  const name = first?.name?.trim();
  if (!name || !GOOGLE_PHOTO_NAME.test(name)) return null;
  const a = first?.authorAttributions?.[0];
  const uri = a?.uri?.trim();
  return {
    name,
    author: a?.displayName?.trim() || null,
    authorUri: uri && /^https:\/\/[^\s]+$/i.test(uri) ? uri : null,
  };
}

export interface GoogleOptions {
  /** Valor de `process.env.GOOGLE_PLACES_API_KEY` (a fábrica lê o ambiente e passa aqui). */
  apiKey: string | undefined;
  http: HttpFetch;
  baseUrl?: string;
  /** Chamado a cada requisição feita (cota diária). */
  onCall?: () => void;
  /** Requisições que ainda cabem na cota; a paginação para quando chega a zero. */
  callsLeft?: () => number;
  /** Recusa da API (401/403): status e mensagem, sem a chave. */
  onError?: (detail: { status: number; message: string }) => void;
}

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

const PRICE: Record<string, number> = {
  PRICE_LEVEL_INEXPENSIVE: 1,
  PRICE_LEVEL_MODERATE: 2,
  PRICE_LEVEL_EXPENSIVE: 3,
  PRICE_LEVEL_VERY_EXPENSIVE: 4,
};

/** "padaria em Cuiabá"; com cozinha, "restaurante japonês sushi em Cuiabá". */
export function googleSearchText(category: string, subcategory: string | null | undefined): string {
  const cat = categoryBySlug(category);
  const cuisine = cuisineBySlug(subcategory);
  const term = [cat?.taQuery ?? category, cuisine?.taQuery].filter(Boolean).join(" ");
  return `${term} em Cuiabá`;
}

function component(p: GooglePlace, types: string[]): string | null {
  const c = p.addressComponents?.find((a) => a.types?.some((t) => types.includes(t)));
  return c?.longText?.trim() || null;
}

/**
 * Lugar do Google no formato do Guia; `null` quando não é de Cuiabá, falta id ou nome, ou (na
 * busca) o tipo principal não cabe na categoria, como hotel na busca de padaria.
 */
export function toGoogleVenue(
  p: GooglePlace,
  category: string,
  subcategory: string | null,
  opts: { checkType?: boolean } = {},
): VenueRecord | null {
  const id = p.id?.trim();
  const name = p.displayName?.text?.trim();
  if (!id || !name) return null;
  const type = p.primaryType?.trim() || null;
  if ((opts.checkType ?? true) && !googleTypeMatches(category, subcategory, type)) return null;
  const city = component(p, ["locality", "administrative_area_level_2"]);
  if (!city || fold(city) !== "cuiaba") return null;
  const rating = typeof p.rating === "number" && p.rating >= 0 && p.rating <= 5 ? p.rating : null;
  const count =
    typeof p.userRatingCount === "number" && p.userRatingCount >= 0
      ? Math.floor(p.userRatingCount)
      : null;
  const web = p.websiteUri?.trim();
  const maps = p.googleMapsUri?.trim();
  const hours = p.regularOpeningHours?.weekdayDescriptions;
  const lat = p.location?.latitude;
  const lng = p.location?.longitude;
  return {
    name,
    category,
    subcategory,
    neighborhood: component(p, ["sublocality_level_1", "sublocality"]),
    address: p.formattedAddress?.trim() || null,
    lat: typeof lat === "number" ? lat : null,
    lng: typeof lng === "number" ? lng : null,
    phone: p.nationalPhoneNumber?.trim() || null,
    website: web && /^https?:\/\//i.test(web) ? web : null,
    instagram: null,
    hours: hours?.length ? hours.join("; ") : null,
    priceLevel: (p.priceLevel && PRICE[p.priceLevel]) || null,
    rating,
    ratingCount: rating !== null ? count : null,
    ratingSource: rating !== null ? "google" : null,
    tripadvisorRank: null,
    tripadvisorUrl: null,
    googleMapsUrl: maps && /^https:\/\//i.test(maps) ? maps : null,
    googleType: type,
    googlePhoto: googlePhotoOf(p),
    placeIds: { google: id },
    sources: ["google"],
  };
}

export function createGoogleProvider(
  opts: GoogleOptions,
): VenueProvider & { readonly enabled: boolean } {
  const key = opts.apiKey?.trim();
  const base = opts.baseUrl ?? GOOGLE_PLACES_URL;

  async function call(
    path: string,
    mask: string,
    body?: unknown,
  ): Promise<Result<unknown, ProviderError>> {
    if (!key) return err("no_key");
    opts.onCall?.();
    let res: Response;
    try {
      res = await opts.http(`${base}${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "X-Goog-Api-Key": key,
          "X-Goog-FieldMask": mask,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Mensagem fixa: o erro do fetch pode trazer cabeçalhos e, com eles, a chave.
      return err("network");
    }
    if (res.status === 401 || res.status === 403 || res.status === 400) {
      const text = await res.text().catch(() => "");
      // A Places API (New) responde chave inválida com 400 API_KEY_INVALID, não 401/403.
      const refused = res.status !== 400 || text.includes("API_KEY_INVALID");
      if (!refused) return err("invalid");
      if (opts.onError) {
        const message = text.split(key).join("[chave]").replace(/\s+/g, " ").trim().slice(0, 300);
        opts.onError({ status: res.status, message });
      }
      return err("unauthorized");
    }
    if (res.status === 429) return err("rate_limited");
    if (!res.ok) return err("http");
    try {
      return ok(await res.json());
    } catch {
      return err("invalid");
    }
  }

  return {
    source: "google",
    enabled: !!key,
    async search(q: VenueQuery) {
      if (!key) return err("no_key");
      const category = q.category ?? "restaurante";
      const subcategory = q.subcategory ?? null;
      const textQuery = q.name?.trim()
        ? `${q.name.trim()} em Cuiabá`
        : googleSearchText(category, subcategory);
      const includedType = googleIncludedType(category, subcategory);
      const out: VenueRecord[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        if (opts.callsLeft && opts.callsLeft() <= 0) break;
        const r = await call("/places:searchText", SEARCH_MASK, {
          textQuery,
          languageCode: "pt-BR",
          regionCode: "BR",
          pageSize: 20,
          locationBias: { circle: { center: CENTER, radius: RADIUS_M } },
          ...(includedType ? { includedType, strictTypeFiltering: true } : {}),
          ...(pageToken ? { pageToken } : {}),
        });
        if (!r.ok) return page === 0 ? r : ok(out);
        const data = r.value as { places?: GooglePlace[]; nextPageToken?: string };
        for (const p of data.places ?? []) {
          const v = toGoogleVenue(p, category, subcategory);
          if (v) out.push(v);
        }
        if (q.limit !== undefined && out.length >= q.limit) return ok(out.slice(0, q.limit));
        pageToken = data.nextPageToken;
        if (!pageToken) break;
      }
      return ok(out);
    },
    async details(id) {
      if (!/^[A-Za-z0-9_-]{10,300}$/.test(id)) return err("invalid");
      const r = await call(`/places/${id}`, DETAILS_MASK);
      if (!r.ok) return r;
      return ok(toGoogleVenue(r.value as GooglePlace, "restaurante", null, { checkType: false }));
    },
  };
}
