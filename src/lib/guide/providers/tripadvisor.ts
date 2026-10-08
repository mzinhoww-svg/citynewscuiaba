import type { HttpFetch } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import { categoryBySlug, cuisineBySlug } from "../categories";
import type { VenueRecord } from "../types";
import { guideUserAgent, type ProviderError, type VenueProvider, type VenueQuery } from "./types";
import { fold } from "@/lib/text/fold";

/**
 * TripAdvisor Content API (R38). A chave vem só do ambiente (`TRIPADVISOR_API_KEY`) e entra aqui
 * por parâmetro: nunca em código, teste ou fixture; sem chave o provedor devolve `no_key` e o
 * Guia cai no modo de pesquisa web (R33). Guardamos só nota, contagem, posição no ranking e dados
 * cadastrais do lugar; texto de avaliação nunca é lido nem guardado (spec R1). A chave nunca
 * aparece em erro nem em log (a URL com `key=` fica só dentro deste arquivo).
 */

export const TRIPADVISOR_URL = "https://api.content.tripadvisor.com/api/v1";
/** Centro de Cuiabá e raio de busca. */
const CENTER = "-15.6014,-56.0979";
const RADIUS_KM = 25;

interface TaAddress {
  street1?: string;
  city?: string;
  state?: string;
  address_string?: string;
}

interface TaDetails {
  location_id?: string;
  name?: string;
  web_url?: string;
  address_obj?: TaAddress;
  latitude?: string | number;
  longitude?: string | number;
  phone?: string;
  website?: string;
  rating?: string | number;
  num_reviews?: string | number;
  price_level?: string;
  ranking_data?: { ranking?: string | number };
  cuisine?: { name?: string; localized_name?: string }[];
  hours?: { weekday_text?: string[] };
}

export interface TripadvisorOptions {
  /** Valor de `process.env.TRIPADVISOR_API_KEY` (a rota lê o ambiente e passa aqui). */
  apiKey: string | undefined;
  http: HttpFetch;
  baseUrl?: string;
  userAgent?: string;
  /**
   * URL do site (APP_URL). A chave da Content API é restrita a domínios cadastrados no portal do
   * TripAdvisor e conferida pelo `Referer`; sem ele a API responde 401/403 (chave "não autorizada").
   */
  referer?: string;
  /**
   * Recusa da API (401/403): status e mensagem devolvida, sem a chave, para diagnosticar o
   * cadastro da chave no portal do TripAdvisor (domínio, cobrança, chave inativa).
   */
  onError?: (detail: { status: number; message: string }) => void;
  /** Chamado a cada requisição feita (contagem de cota e custo). */
  onCall?: () => void;
}

const num = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(",", ".")) : NaN;
  return Number.isFinite(n) ? n : null;
};

/** "$$ - $$$" → 2; "$$$$" → 4. */
function priceLevel(v: string | undefined): number | null {
  if (!v) return null;
  const n = Math.max(0, ...(v.match(/\$+/g) ?? []).map((s) => s.length));
  return n >= 1 && n <= 4 ? n : null;
}

function inCuiaba(a: TaAddress | undefined): boolean {
  return !!a?.city && fold(a.city).includes("cuiaba");
}

function street(a: TaAddress | undefined): string | null {
  const s = a?.street1?.trim();
  return s ? s : null;
}

/** Detalhes da Content API → lugar. Nunca lê `reviews`. */
export function toVenue(
  d: TaDetails,
  category: string,
  subcategory: string | null,
): VenueRecord | null {
  const id = d.location_id?.trim();
  const name = d.name?.trim();
  if (!id || !name) return null;
  const rank = num(d.ranking_data?.ranking);
  const rawRating = num(d.rating);
  const rating = rawRating !== null && rawRating >= 0 && rawRating <= 5 ? rawRating : null;
  const count = num(d.num_reviews);
  const web = d.website?.trim();
  const trip = d.web_url?.trim();
  const cuisine = d.cuisine?.[0]?.name?.toLowerCase();
  return {
    name,
    category,
    subcategory: subcategory ?? (cuisine && cuisineBySlug(cuisine) ? cuisine : null),
    neighborhood: null,
    address: street(d.address_obj),
    lat: num(d.latitude),
    lng: num(d.longitude),
    phone: d.phone?.trim() || null,
    website: web && /^https?:\/\//i.test(web) ? web : null,
    instagram: null,
    hours: d.hours?.weekday_text?.length ? d.hours.weekday_text.join("; ") : null,
    priceLevel: priceLevel(d.price_level),
    rating,
    ratingCount: count !== null && count >= 0 ? Math.floor(count) : null,
    ratingSource: rating !== null ? "tripadvisor" : null,
    tripadvisorRank: rank !== null && rank >= 1 ? Math.floor(rank) : null,
    tripadvisorUrl: trip && /^https:\/\//i.test(trip) ? trip : null,
    googleMapsUrl: null,
    googleType: null,
    googlePhoto: null,
    placeIds: { tripadvisor: id },
    sources: ["tripadvisor"],
  };
}

export function createTripadvisorProvider(
  opts: TripadvisorOptions,
): VenueProvider & { readonly enabled: boolean } {
  const key = opts.apiKey?.trim();
  const base = opts.baseUrl ?? TRIPADVISOR_URL;
  const userAgent = opts.userAgent ?? guideUserAgent();
  const referer = opts.referer ? `${opts.referer.replace(/\/+$/, "")}/` : null;

  async function get(
    path: string,
    params: Record<string, string>,
  ): Promise<Result<unknown, ProviderError>> {
    if (!key) return err("no_key");
    const qs = new URLSearchParams({ ...params, key, language: "pt" });
    opts.onCall?.();
    let res: Response;
    try {
      res = await opts.http(`${base}${path}?${qs.toString()}`, {
        headers: {
          "User-Agent": userAgent,
          Accept: "application/json",
          ...(referer ? { Referer: referer } : {}),
        },
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      // Mensagem fixa: o erro do fetch pode trazer a URL e, com ela, a chave.
      return err("network");
    }
    if (res.status === 401 || res.status === 403) {
      if (opts.onError) {
        const text = await res.text().catch(() => "");
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
    source: "tripadvisor",
    enabled: !!key,
    async search(q: VenueQuery) {
      const cat = q.category ? categoryBySlug(q.category) : undefined;
      const term =
        q.name?.trim() ||
        [cat?.taQuery, cuisineBySlug(q.subcategory)?.taQuery].filter(Boolean).join(" ");
      if (!term) return err("invalid");
      const params: Record<string, string> = {
        searchQuery: `${term} ${q.area}`,
        latLong: CENTER,
        radius: String(RADIUS_KM),
        radiusUnit: "km",
      };
      if (cat?.tripadvisor) params["category"] = cat.tripadvisor;
      const r = await get("/location/search", params);
      if (!r.ok) return r;
      const rows = (
        r.value as { data?: { location_id?: string; name?: string; address_obj?: TaAddress }[] }
      ).data;
      if (!Array.isArray(rows)) return err("invalid");
      const limit = q.limit ?? 30;
      const out: VenueRecord[] = [];
      for (const row of rows) {
        if (!inCuiaba(row.address_obj)) continue;
        const v = toVenue(
          { location_id: row.location_id, name: row.name, address_obj: row.address_obj },
          q.category ?? "restaurante",
          q.subcategory ?? null,
        );
        if (v) out.push(v);
        if (out.length >= limit) break;
      }
      return ok(out);
    },
    async details(id) {
      if (!/^\d{1,12}$/.test(id)) return err("invalid");
      const r = await get(`/location/${id}/details`, { currency: "BRL" });
      if (!r.ok) return r;
      const d = r.value as TaDetails;
      if (!inCuiaba(d.address_obj)) return ok(null);
      return ok(toVenue(d, "restaurante", null));
    },
  };
}
