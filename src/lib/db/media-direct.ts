import "server-only";
import type { ArticleImage } from "@/lib/db/queries/types";
import { MEDIA_URL_TTL_SEC, isServable, type ServeMediaDeps } from "@/lib/media/serve";
import { VARIANT_WIDTHS, variantPath, variantWidthsFor } from "@/lib/media/variants";
import { mediaServeDeps } from "./media-serve";

const MEDIA_ROUTE = /^\/api\/media\/([0-9a-f-]{36})$/i;

/**
 * URL direta (assinada, curta) da foto da manchete, resolvida no servidor a cada requisição (o
 * HTML já é por requisição, A-042): o LCP não passa pelo redirecionamento de `/api/media`. Mesmas
 * regras da rota (aprovada; reprodução só com a flag). Qualquer falha devolve `null` e a foto usa
 * a rota; no navegador, URL direta que falha cai na rota e depois no substituto (item 78).
 */
export async function resolveDirectImage(
  src: string,
  depsOverride?: ServeMediaDeps,
): Promise<{ directSrc: string; directSrcSet?: string } | null> {
  const id = MEDIA_ROUTE.exec(src)?.[1];
  if (!id) return null;
  try {
    const deps = depsOverride ?? mediaServeDeps();
    const sign = deps.store.signedUrl?.bind(deps.store);
    if (!sign) return null;
    const asset = await deps.asset(id);
    if (!asset || !(await isServable(asset, deps))) return null;
    const widths = asset.width ? variantWidthsFor(asset.width) : [...VARIANT_WIDTHS];
    const [original, ...variants] = await Promise.all([
      sign(asset.storagePath, MEDIA_URL_TTL_SEC),
      ...widths.map((w) => sign(variantPath(asset.storagePath, w), MEDIA_URL_TTL_SEC)),
    ]);
    if (!original?.ok) return null;
    const set = variants.flatMap((r, i) => (r.ok ? [`${r.value} ${widths[i]}w`] : []));
    // O original entra no srcset só com largura conhecida (descritor `w` obrigatório).
    if (set.length > 0 && asset.width) set.push(`${original.value} ${asset.width}w`);
    return {
      directSrc: original.value,
      ...(set.length > 0 ? { directSrcSet: set.join(", ") } : {}),
    };
  } catch {
    return null;
  }
}

/** A imagem com a URL direta, quando der; senão a mesma imagem (só a rota). */
export async function withDirectImage<T extends ArticleImage | undefined>(image: T): Promise<T> {
  if (!image) return image;
  const direct = await resolveDirectImage(image.src);
  return direct ? { ...image, ...direct } : image;
}
