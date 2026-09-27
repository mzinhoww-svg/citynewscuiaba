import { err, ok, type Result } from "@/lib/result";
import { FETCH_TIMEOUT_MS, isForbiddenHost } from "@/lib/pipeline/http";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { MAX_IMAGE_BYTES } from "./limits";

export interface DownloadedImage {
  url: string;
  contentType: string | null;
  bytes: Uint8Array;
}

/**
 * Baixa a imagem da matéria original identificado como `CityNewsBot`, com timeout, limite de
 * 10 MB e bloqueio de hosts internos (SSRF). Só `image/*` raster; SVG é recusado.
 */
export async function fetchImage(
  deps: { http: HttpFetch; userAgent: string },
  url: string,
): Promise<Result<DownloadedImage, string>> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return err(`URL inválida: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return err(`esquema não permitido: ${parsed.protocol}`);
  if (isForbiddenHost(parsed.hostname)) return err(`host não permitido: ${parsed.hostname}`);

  let res: Response;
  try {
    res = await deps.http(parsed.toString(), {
      headers: {
        "User-Agent": deps.userAgent,
        Accept: "image/avif, image/webp, image/jpeg, image/png, image/gif;q=0.8",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
  if (res.status < 200 || res.status >= 300) return err(`HTTP ${res.status} em ${url}`);
  const contentType = res.headers.get("content-type");
  if (contentType && (!/^image\//i.test(contentType) || /svg/i.test(contentType)))
    return err(`conteúdo não é imagem raster: ${contentType}`);
  if (Number(res.headers.get("content-length") ?? "0") > MAX_IMAGE_BYTES)
    return err("imagem maior que 10 MB");
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
  if (bytes.byteLength > MAX_IMAGE_BYTES) return err("imagem maior que 10 MB");
  return ok({ url: res.url || parsed.toString(), contentType, bytes });
}
