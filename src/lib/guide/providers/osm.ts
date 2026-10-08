import type { HttpFetch } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import { cuisineFromOsm, osmClauses } from "../categories";
import type { VenueRecord } from "../types";
import {
  guideUserAgent,
  wait,
  type ProviderError,
  type VenueProvider,
  type VenueQuery,
} from "./types";

/**
 * OpenStreetMap via Overpass API (dado aberto, ODbL: a tela cita "OpenStreetMap"). Termos de uso
 * respeitados: User-Agent identificável, uma consulta por vez e intervalo mínimo entre elas
 * (Overpass pede educação; o padrão aqui é 2 s), consulta com `timeout`. Nunca raspa o site.
 */

export const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
export const OSM_ATTRIBUTION_URL = "https://www.openstreetmap.org/copyright";

export interface OsmElement {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: Record<string, string>;
}

export interface OsmOptions {
  http: HttpFetch;
  url?: string;
  /** Intervalo mínimo entre consultas (ms). */
  minIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  userAgent?: string;
}

/** Texto da cláusula de município: Cuiabá é admin_level 8 em Mato Grosso. */
function areaClause(area: string): string {
  const name = area.replace(/["\\]/g, "");
  return `area["boundary"="administrative"]["admin_level"="8"]["name"="${name}"]->.a;`;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\"]/g, "\\$&");

export function buildQuery(q: VenueQuery): string {
  const limit = Math.min(Math.max(Math.floor(q.limit ?? 250), 1), 500);
  const head = `[out:json][timeout:60];${areaClause(q.area)}`;
  if (q.name) {
    const rx = escapeRegex(q.name.trim());
    return `${head}(nwr["name"~"${rx}",i](area.a););out center tags ${limit};`;
  }
  const clauses = q.category ? osmClauses(q.category, q.subcategory) : [];
  if (clauses.length === 0) return "";
  const body = clauses.map((c) => `nwr${c}["name"](area.a);`).join("");
  return `${head}(${body});out center tags ${limit};`;
}

const first = (v: string | undefined) => v?.split(";")[0]?.trim() || null;

function website(tags: Record<string, string>): string | null {
  const raw = first(tags["website"] ?? tags["contact:website"] ?? tags["url"]);
  if (!raw) return null;
  const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(url).href;
  } catch {
    return null;
  }
}

function instagram(tags: Record<string, string>): string | null {
  const raw = first(tags["contact:instagram"] ?? tags["instagram"]);
  if (!raw) return null;
  const handle = raw
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
    .replace(/^@/, "")
    .replace(/[/?#].*$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `https://www.instagram.com/${handle}` : null;
}

function address(tags: Record<string, string>): string | null {
  const street = tags["addr:street"];
  const number = tags["addr:housenumber"];
  if (street) return number ? `${street}, ${number}` : street;
  return tags["addr:full"]?.trim() || null;
}

/** Elemento do Overpass → lugar. Sem nome ou sem ponto, descarta (`null`). */
export function toVenue(
  el: OsmElement,
  category: string,
  subcategory: string | null,
): VenueRecord | null {
  const tags = el.tags ?? {};
  const name = tags["name"]?.trim();
  if (!name || !el.type || el.id === undefined) return null;
  const lat = el.lat ?? el.center?.lat ?? null;
  const lng = el.lon ?? el.center?.lon ?? null;
  const price = Number(tags["price"] ?? NaN);
  return {
    name,
    category,
    subcategory: subcategory ?? cuisineFromOsm(tags["cuisine"]),
    neighborhood: tags["addr:suburb"] ?? tags["addr:neighbourhood"] ?? null,
    address: address(tags),
    lat: typeof lat === "number" && Number.isFinite(lat) ? lat : null,
    lng: typeof lng === "number" && Number.isFinite(lng) ? lng : null,
    phone: first(tags["phone"] ?? tags["contact:phone"] ?? tags["contact:mobile"]),
    website: website(tags),
    instagram: instagram(tags),
    hours: tags["opening_hours"]?.trim() || null,
    priceLevel: Number.isInteger(price) && price >= 1 && price <= 4 ? price : null,
    rating: null,
    ratingCount: null,
    ratingSource: null,
    tripadvisorRank: null,
    tripadvisorUrl: null,
    googleMapsUrl: null,
    googleType: null,
    googlePhoto: null,
    placeIds: { osm: `${el.type}/${el.id}` },
    sources: ["osm"],
  };
}

export function createOsmProvider(opts: OsmOptions): VenueProvider {
  const url = opts.url ?? OVERPASS_URL;
  const minInterval = opts.minIntervalMs ?? 2000;
  const sleep = opts.sleep ?? wait;
  const now = opts.now ?? Date.now;
  const userAgent = opts.userAgent ?? guideUserAgent();
  let last = Number.NEGATIVE_INFINITY;

  async function run(query: string): Promise<Result<OsmElement[], ProviderError>> {
    const gap = last + minInterval - now();
    if (gap > 0) await sleep(gap);
    last = now();
    let res: Response;
    try {
      res = await opts.http(`${url}?data=${encodeURIComponent(query)}`, {
        headers: { "User-Agent": userAgent, Accept: "application/json" },
        signal: AbortSignal.timeout(70_000),
      });
    } catch {
      return err("network");
    }
    if (res.status === 429) return err("rate_limited");
    if (!res.ok) return err(res.status === 504 ? "rate_limited" : "http");
    try {
      const json = (await res.json()) as { elements?: OsmElement[] };
      return ok(Array.isArray(json.elements) ? json.elements : []);
    } catch {
      return err("invalid");
    }
  }

  return {
    source: "osm",
    async search(q) {
      const query = buildQuery(q);
      if (!query) return err("invalid");
      const r = await run(query);
      if (!r.ok) return r;
      const seen = new Set<string>();
      const out: VenueRecord[] = [];
      for (const el of r.value) {
        const v = toVenue(el, q.category ?? "restaurante", q.subcategory ?? null);
        const id = v?.placeIds.osm;
        if (!v || !id || seen.has(id)) continue;
        seen.add(id);
        out.push(v);
      }
      return ok(out);
    },
    async details(id) {
      const m = /^(node|way|relation)\/(\d+)$/.exec(id);
      if (!m) return err("invalid");
      const r = await run(`[out:json][timeout:25];${m[1]}(${m[2]});out center tags;`);
      if (!r.ok) return r;
      const el = r.value[0];
      return ok(el ? toVenue(el, "restaurante", null) : null);
    },
  };
}
