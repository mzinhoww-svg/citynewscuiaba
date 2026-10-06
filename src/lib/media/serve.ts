import type { MediaStore } from "./store";
import { VARIANT_CONTENT_TYPE, pickVariantWidth, variantPath } from "./variants";

/** Validade da URL assinada do bucket privado `media` (ADR-009). */
export const MEDIA_URL_TTL_SEC = 300;
/** Cache do redirecionamento: sempre menor que a validade da URL assinada. */
const REDIRECT_CACHE_SEC = 120;
/** Cache dos bytes servidos direto (Storage sem URL assinada). */
const BYTES_CACHE_SEC = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ServableAsset {
  id: string;
  kind: "original" | "reproduction" | "licensed" | "illustrative" | "ai_generated";
  status: "pending" | "approved" | "blocked";
  storagePath: string;
  contentType: string | null;
  /** Largura do original (`media_assets.width`): define quais variantes existem. */
  width?: number | null;
}

export interface ServeMediaDeps {
  asset(id: string): Promise<ServableAsset | null>;
  /** Flag `image_reproduction_enabled` (falha fechada: erro = desligada). */
  reproductionEnabled(): Promise<boolean>;
  store: MediaStore;
}

/** Endereço público de uma imagem aprovada: a rota própria, nunca a URL do bucket privado. */
export function mediaHref(assetId: string): string {
  return `/api/media/${assetId}`;
}

const notFound = () =>
  new Response("Imagem não encontrada", {
    status: 404,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });

/** Pode ir ao público: aprovada; reprodução só com a flag ligada (ADR-009). */
export async function isServable(
  asset: ServableAsset | null,
  deps: Pick<ServeMediaDeps, "reproductionEnabled">,
): Promise<boolean> {
  if (!asset || asset.status !== "approved") return false;
  if (asset.kind === "reproduction" && !(await deps.reproductionEnabled())) return false;
  return true;
}

/**
 * `/api/media/[id]` (ADR-009): só imagem `approved`; reprodução só com a flag
 * `image_reproduction_enabled` ligada. Com Storage do Supabase, redireciona para URL assinada
 * curta; sem URL assinada (Storage em memória), serve os bytes com cache curto.
 * `width` (`?w=`, item 79): a menor variante ≥ w; variante ausente cai no original.
 */
export async function serveMedia(
  id: string,
  deps: ServeMediaDeps,
  opts: { width?: number } = {},
): Promise<Response> {
  if (!UUID.test(id)) return notFound();
  const asset = await deps.asset(id);
  if (!asset || !(await isServable(asset, deps))) return notFound();

  const w = opts.width === undefined ? null : pickVariantWidth(opts.width, asset.width);
  const variant = w === null ? null : variantPath(asset.storagePath, w);

  if (deps.store.signedUrl) {
    const signed = variant ? await deps.store.signedUrl(variant, MEDIA_URL_TTL_SEC) : null;
    const url = signed?.ok
      ? signed
      : await deps.store.signedUrl(asset.storagePath, MEDIA_URL_TTL_SEC);
    if (!url.ok) return notFound();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.value,
        "Cache-Control": `public, max-age=${REDIRECT_CACHE_SEC}, s-maxage=${REDIRECT_CACHE_SEC}`,
      },
    });
  }
  const fromVariant = variant ? await deps.store.read(variant) : null;
  const file = fromVariant?.ok ? fromVariant : await deps.store.read(asset.storagePath);
  if (!file.ok) return notFound();
  const body = new Uint8Array(file.value.bytes);
  const contentType = fromVariant?.ok
    ? VARIANT_CONTENT_TYPE
    : (asset.contentType ?? file.value.contentType);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": `public, max-age=${BYTES_CACHE_SEC}, s-maxage=${BYTES_CACHE_SEC}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** `?w=` da URL: inteiro positivo, senão nenhum (original). */
export function parseWidthParam(value: string | null): number | undefined {
  if (!value || !/^\d{1,5}$/.test(value)) return undefined;
  const n = Number(value);
  return n > 0 ? n : undefined;
}
