import { GUIDE } from "@/content/pt-BR/guide";
import { GOOGLE_PHOTO_NAME, GOOGLE_PLACES_URL } from "./providers/google";

/**
 * Foto principal do Google no Guia (A-212). O arquivo nunca é guardado: a rota
 * `/api/guia/foto/[slug]` pede ao Google, com a chave do servidor no cabeçalho `X-Goog-Api-Key`, o
 * endereço da imagem (`skipHttpRedirect=true`, assim a chave só vai à Places API) e repassa os
 * bytes com cache de CDN. Qualquer falha vira 404 sem detalhe: a chave e os endereços do Google
 * nunca aparecem em resposta nem em log.
 */

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 200;
export const GOOGLE_PHOTO_MAX_WIDTH = 800;
export const GOOGLE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const GOOGLE_PHOTO_TIMEOUT_MS = 10_000;
/** Teto diário de fotos buscadas no Google (`GUIDE_GOOGLE_PHOTO_DAILY` ajusta). */
export const GOOGLE_PHOTO_DAILY_DEFAULT = 200;
export const GOOGLE_PHOTO_CACHE =
  "public, max-age=3600, s-maxage=43200, stale-while-revalidate=86400";
/** Só imagem raster: SVG servido da nossa origem poderia executar script. */
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);

export const googlePhotoSrc = (slug: string) => `/api/guia/foto/${slug}`;

export function googlePhotoDailyLimit(env: Record<string, string | undefined>): number {
  const raw = env.GUIDE_GOOGLE_PHOTO_DAILY;
  const n = Number(raw);
  return raw !== undefined && raw.trim() !== "" && Number.isInteger(n) && n >= 0
    ? n
    : GOOGLE_PHOTO_DAILY_DEFAULT;
}

/** Foto como a tela pública a usa (mesmo formato de `GuidePhoto`). */
export interface GoogleGuidePhoto {
  src: string;
  credit: string;
  originUrl: string;
  fromGoogle: true;
}

/**
 * Foto do Google do lugar para a tela: crédito "Foto: autor · Google" e link para o perfil do
 * autor (ou, sem ele, para o lugar no Google Maps). `null` sem referência válida.
 */
export function googleGuidePhoto(v: {
  slug: string;
  googlePhotoName: string | null;
  googlePhotoAuthor: string | null;
  googlePhotoAuthorUri: string | null;
  googleMapsUrl: string | null;
}): GoogleGuidePhoto | null {
  const name = v.googlePhotoName;
  if (!name || !GOOGLE_PHOTO_NAME.test(name)) return null;
  const https = (u: string | null) => (u && /^https:\/\/\S+$/i.test(u) ? u : null);
  const placeId = name.split("/")[1] ?? "";
  return {
    src: googlePhotoSrc(v.slug),
    credit: GUIDE.venue.googlePhotoCredit(v.googlePhotoAuthor?.trim() || null),
    originUrl:
      https(v.googlePhotoAuthorUri) ??
      https(v.googleMapsUrl) ??
      `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${placeId}`,
    fromGoogle: true,
  };
}

/** Linha do Google no rodapé da lista: avaliações, fotos ou as duas (termos do Google). */
export function googleAttribution(o: { ratings: boolean; photos: boolean }): string | null {
  const a = GUIDE.list.attribution;
  if (o.ratings && o.photos) return a.googleWithPhotos;
  if (o.ratings) return a.google;
  if (o.photos) return a.googlePhotos;
  return null;
}

export interface GooglePhotoDeps {
  /** Referência da foto do lugar ativo e público; `null` quando não há. */
  photoName(slug: string): Promise<string | null>;
  /** Conta uma busca no limite diário; `false` = acima do limite. */
  allow(): Promise<boolean>;
  apiKey: string | undefined;
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  baseUrl?: string;
  /** Registro de falha (mensagem fixa, sem chave nem endereço). */
  log?: (message: string) => void;
}

const notFound = () =>
  new Response("Foto indisponível", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });

/** Lê o corpo até `max` bytes; acima disso, `null`. */
async function readCapped(res: Response, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!res.body) return null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

/** Endereço da imagem devolvido pela Places API: só https em `*.googleusercontent.com`. */
function isGoogleImageUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.port === "" || u.port === "443") &&
      u.hostname.endsWith(".googleusercontent.com")
    );
  } catch {
    return false;
  }
}

export async function serveGooglePhoto(slug: string, deps: GooglePhotoDeps): Promise<Response> {
  const fail = (reason: string) => {
    deps.log?.(`guia-foto: ${reason}`);
    return notFound();
  };
  if (!slug || slug.length > MAX_SLUG || !SLUG.test(slug)) return notFound();
  const key = deps.apiKey?.trim();
  if (!key) return notFound();
  const name = await deps.photoName(slug).catch(() => null);
  if (!name || !GOOGLE_PHOTO_NAME.test(name)) return notFound();
  if (!(await deps.allow())) return fail("limite diário");

  const signal = AbortSignal.timeout(GOOGLE_PHOTO_TIMEOUT_MS);
  try {
    const base = deps.baseUrl ?? GOOGLE_PLACES_URL;
    const metaRes = await deps.fetch(
      `${base}/${name}/media?maxWidthPx=${GOOGLE_PHOTO_MAX_WIDTH}&skipHttpRedirect=true`,
      { method: "GET", headers: { "X-Goog-Api-Key": key }, redirect: "error", signal },
    );
    if (!metaRes.ok) return fail(`google ${metaRes.status}`);
    const meta = (await metaRes.json()) as { photoUri?: unknown };
    const uri = typeof meta.photoUri === "string" ? meta.photoUri : "";
    if (!isGoogleImageUrl(uri)) return fail("resposta sem endereço do Google");

    // Sem a chave: o endereço devolvido já é assinado pelo Google.
    const img = await deps.fetch(uri, { method: "GET", redirect: "follow", signal });
    if (!img.ok) return fail(`imagem ${img.status}`);
    const type = (img.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) return fail("tipo não aceito");
    const declared = Number(img.headers.get("content-length") ?? "0");
    if (declared > GOOGLE_PHOTO_MAX_BYTES) return fail("imagem grande demais");
    const bytes = await readCapped(img, GOOGLE_PHOTO_MAX_BYTES);
    if (!bytes || bytes.byteLength === 0) return fail("imagem grande demais ou vazia");
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": type,
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": GOOGLE_PHOTO_CACHE,
        "X-Robots-Tag": "noindex",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    // Mensagem fixa: o erro do fetch pode trazer cabeçalhos e, com eles, a chave.
    return fail("rede");
  }
}
