/**
 * Lógica pura do service worker (spec 2026-09-28 §8): allowlist de rota, o que pode entrar em
 * cache (G2), LRU com teto de 25 MB, payload do push, alvo do toque e rótulos de cópia antiga.
 * Nada aqui toca `caches`, IndexedDB ou rede: `index.ts` só liga eventos a estas funções.
 */
import { OFFLINE_TEXT, SW_TEXT } from "@/content/pt-BR/offline";
import {
  CACHES,
  NEVER_CACHE,
  OFFLINE_MARKER_HEADER,
  type IndexEntry,
  type OfflineItem,
  type OfflineListing,
} from "./contract";

export type RouteKind = "pagina" | "materia" | "favoritos";

const SLUG = /^[a-z0-9-]{1,120}$/;

/** Rota da allowlist de cache: `/`, `/[editoria]`, `/materia/*`, `/favoritos`; o resto, nunca. */
export function routeKind(path: string, sections: readonly string[]): RouteKind | null {
  if (NEVER_CACHE.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  if (path === "/") return "pagina";
  if (path === "/favoritos") return "favoritos";
  const m = /^\/materia\/([^/]+)$/.exec(path);
  if (m) return SLUG.test(m[1]!) ? "materia" : null;
  const s = /^\/([a-z0-9-]+)$/.exec(path);
  if (s && sections.includes(s[1]!)) return "pagina";
  return null;
}

/** Navegações que o SW nunca intercepta: Estúdio, API, login e perfil (spec D-P11, §8.4). */
const SW_IGNORED = ["/estudio", "/api", "/entrar", "/criar-conta", "/perfil", "/auth"] as const;

export function bypassesSw(path: string): boolean {
  return SW_IGNORED.some((p) => path === p || path.startsWith(`${p}/`));
}

/** Janela do Estúdio (o toque no aviso nunca navega por cima dela, PWA-11). */
export function isStudioWindow(url: string, origin: string): boolean {
  try {
    const u = new URL(url, origin);
    return u.origin === origin && (u.pathname === "/estudio" || u.pathname.startsWith("/estudio/"));
  } catch {
    return false;
  }
}

export function cacheForKind(kind: RouteKind): string {
  if (kind === "materia") return CACHES.lidas;
  if (kind === "favoritos") return CACHES.salvos;
  return CACHES.paginas;
}

/** Só 200, GET, mesma origem, com `x-cn-offline: 1` e sem `Set-Cookie`; ignora `Cache-Control`. */
export function isCacheableResponse(r: {
  method: string;
  status: number;
  sameOrigin: boolean;
  headers: Headers;
}): boolean {
  if (r.method !== "GET" || r.status !== 200 || !r.sameOrigin) return false;
  if (r.headers.get(OFFLINE_MARKER_HEADER) !== "1") return false;
  if (r.headers.has("set-cookie")) return false;
  return true;
}

const byLastAccess = (a: IndexEntry, b: IndexEntry) => a.lastAccess.localeCompare(b.lastAccess);

/** Entradas além do limite do balde, as de acesso mais antigo primeiro. */
export function overBucketLimit(entries: IndexEntry[], cache: string, max: number): IndexEntry[] {
  const inBucket = entries.filter((e) => e.cache === cache).sort(byLastAccess);
  return inBucket.length > max ? inBucket.slice(0, inBucket.length - max) : [];
}

const EVICTION_ORDER: readonly string[] = [CACHES.lidas, CACHES.paginas, CACHES.assets];

/**
 * O que remover para caber no teto: lidas, depois páginas, depois assets, por `lastAccess`.
 * Salvas e shell nunca. Com `extraBytes` (cota cheia), libera o dobro do necessário.
 */
export function planEviction(
  entries: IndexEntry[],
  capBytes: number,
  extraBytes = 0,
): IndexEntry[] {
  const total = entries.filter((e) => e.cache !== CACHES.shell).reduce((n, e) => n + e.bytes, 0);
  let need = total - capBytes + (extraBytes > 0 ? extraBytes * 2 : 0);
  if (need <= 0) return [];
  const out: IndexEntry[] = [];
  for (const cache of EVICTION_ORDER) {
    for (const e of entries.filter((x) => x.cache === cache).sort(byLastAccess)) {
      if (need <= 0) return out;
      out.push(e);
      need -= e.bytes;
    }
  }
  return out;
}

const BRAND_SUFFIX = /\s*[·|–-]\s*CityNews( Cuiabá)?\s*$/;

export function titleFromHtml(html: string): string | null {
  const m = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  if (!m) return null;
  const t = decodeEntities(m[1]!).replace(/\s+/g, " ").trim().replace(BRAND_SUFFIX, "").trim();
  return t || null;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

export function assetUrlsFromHtml(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/(?:href|src)="(\/_next\/static\/[^"?#]+)/g)) out.add(m[1]!);
  return [...out];
}

/** Caminho interno: começa com `/`, nunca `//`, sem esquema. */
function internalPath(u: unknown): string | null {
  if (typeof u !== "string" || !/^\/(?!\/)/.test(u) || /[\u0000-\u001F\s\\]/.test(u)) return null;
  return u;
}

export interface ParsedPayload {
  title: string;
  body: string;
  tag: string;
  url: string;
  sendId: string | null;
}

const GENERIC: ParsedPayload = {
  title: SW_TEXT.genericTitle,
  body: SW_TEXT.genericBody,
  tag: "cn",
  url: "/",
  sendId: null,
};

/** Payload inválido vira aviso genérico (spec §8.4); `u` externo vira `/`. */
export function parsePayload(raw: unknown): ParsedPayload {
  let data: unknown = raw;
  if (typeof raw === "string") {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ...GENERIC };
    }
  }
  if (!data || typeof data !== "object") return { ...GENERIC };
  const p = data as Record<string, unknown>;
  if (p.v !== 1 || typeof p.t !== "string" || typeof p.b !== "string" || !p.t.trim())
    return { ...GENERIC };
  return {
    title: p.t.slice(0, 120),
    body: p.b.slice(0, 200),
    tag: typeof p.g === "string" && p.g ? p.g.slice(0, 64) : "cn",
    url: internalPath(p.u) ?? "/",
    sendId: typeof p.s === "string" && /^[0-9a-f-]{36}$/i.test(p.s) ? p.s : null,
  };
}

/** Alvo do toque: `data.url` ou o legado `data.href`; só caminho interno (ou URL da origem). */
export function safeTarget(data: unknown, origin: string): string {
  const d = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  const raw = typeof d.url === "string" ? d.url : typeof d.href === "string" ? d.href : "/";
  const internal = internalPath(raw);
  if (internal) return internal;
  try {
    const u = new URL(raw, origin);
    if (u.origin === origin) return `${u.pathname}${u.search}`;
  } catch {
    /* alvo inválido */
  }
  return "/";
}

const CUIABA_OFFSET_MS = -4 * 3_600_000;
function cuiaba(d: Date): { day: string; time: string } {
  const t = new Date(d.getTime() + CUIABA_OFFSET_MS);
  const dd = String(t.getUTCDate()).padStart(2, "0");
  const mm = String(t.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(t.getUTCHours()).padStart(2, "0");
  const mi = String(t.getUTCMinutes()).padStart(2, "0");
  return { day: `${t.getUTCFullYear()}-${mm}-${dd}`, time: `${hh}h${mi}` };
}

/** "Salva às 14h32" (mesmo dia de Cuiabá) ou "Salva em 27/09 às 14h32". */
export function savedAtLabel(cachedAt: Date, now: Date): string {
  const c = cuiaba(cachedAt);
  if (c.day === cuiaba(now).day) return `${OFFLINE_TEXT.savedAt} ${c.time}`;
  const [, mm, dd] = c.day.split("-");
  return `${OFFLINE_TEXT.savedOn} ${dd}/${mm} às ${c.time}`;
}

/** "Salva às 14h32, pode estar desatualizada." */
export function staleLabel(cachedAt: Date, now: Date): string {
  return `${savedAtLabel(cachedAt, now)}, ${OFFLINE_TEXT.staleNotice}`;
}

function item(e: IndexEntry, now: Date): OfflineItem {
  return {
    url: e.url,
    title: e.title ?? e.url,
    cachedAt: e.cachedAt,
    label: savedAtLabel(new Date(e.cachedAt), now),
  };
}

export function offlineListing(entries: IndexEntry[], now: Date): OfflineListing {
  const newestFirst = (a: IndexEntry, b: IndexEntry) => b.lastAccess.localeCompare(a.lastAccess);
  return {
    paginas: entries
      .filter((e) => e.cache === CACHES.paginas)
      .sort((a, b) => (a.url === "/" ? -1 : b.url === "/" ? 1 : a.url.localeCompare(b.url)))
      .map((e) => item(e, now)),
    salvas: entries
      .filter((e) => e.cache === CACHES.salvos && e.url.startsWith("/materia/"))
      .sort(newestFirst)
      .map((e) => item(e, now)),
    lidas: entries
      .filter((e) => e.cache === CACHES.lidas)
      .sort(newestFirst)
      .map((e) => item(e, now)),
  };
}

/**
 * Quando a página foi servida do cache: pelo mapa `clientId → cachedAt` das navegações
 * atendidas; sem registro, pelo índice quando o navegador está offline.
 */
export function cachedAtFor(
  clientMap: Map<string, string>,
  clientId: string,
  url: string,
  entries: IndexEntry[],
  online: boolean,
): string | null {
  const known = clientMap.get(clientId);
  if (known) return known;
  if (online) return null;
  return entries.find((e) => e.url === url)?.cachedAt ?? null;
}

/** Chave do cache: caminho sem consulta nem fragmento (como no SW anterior). */
export function cacheKey(url: string, origin: string): string {
  try {
    return new URL(url, origin).pathname;
  } catch {
    return "/";
  }
}
