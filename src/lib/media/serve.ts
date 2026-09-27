import type { MediaStore } from "./store";

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

/**
 * `/api/media/[id]` (ADR-009): só imagem `approved`; reprodução só com a flag
 * `image_reproduction_enabled` ligada. Com Storage do Supabase, redireciona para URL assinada
 * curta; sem URL assinada (Storage em memória), serve os bytes com cache curto.
 */
export async function serveMedia(id: string, deps: ServeMediaDeps): Promise<Response> {
  if (!UUID.test(id)) return notFound();
  const asset = await deps.asset(id);
  if (!asset || asset.status !== "approved") return notFound();
  if (asset.kind === "reproduction" && !(await deps.reproductionEnabled())) return notFound();

  if (deps.store.signedUrl) {
    const url = await deps.store.signedUrl(asset.storagePath, MEDIA_URL_TTL_SEC);
    if (!url.ok) return notFound();
    return new Response(null, {
      status: 302,
      headers: {
        Location: url.value,
        "Cache-Control": `public, max-age=${REDIRECT_CACHE_SEC}, s-maxage=${REDIRECT_CACHE_SEC}`,
      },
    });
  }
  const file = await deps.store.read(asset.storagePath);
  if (!file.ok) return notFound();
  const body = new Uint8Array(file.value.bytes);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": asset.contentType ?? file.value.contentType,
      "Content-Length": String(body.byteLength),
      "Cache-Control": `public, max-age=${BYTES_CACHE_SEC}, s-maxage=${BYTES_CACHE_SEC}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
