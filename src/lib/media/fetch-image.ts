import { err, ok, type Result } from "@/lib/result";
import { FETCH_TIMEOUT_MS } from "@/lib/pipeline/http";
import { deadlineSignal, safeGet, type ResolveHost } from "@/lib/pipeline/net";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { MAX_IMAGE_BYTES } from "./limits";

export interface DownloadedImage {
  url: string;
  contentType: string | null;
  bytes: Uint8Array;
}

/** Domínio da fonte, sem `www.` (a imagem pode vir dele ou de subdomínio). */
export function sourceDomain(baseUrl: string): string | null {
  try {
    return new URL(baseUrl).hostname
      .toLowerCase()
      .replace(/^www\./, "")
      .replace(/\.$/, "");
  } catch {
    return null;
  }
}

/** Motivo para recusar a imagem fora do domínio da fonte, ou `null` se é dela. */
export function outsideSourceDomain(url: URL, domain: string): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  return host === domain || host.endsWith(`.${domain}`)
    ? null
    : `imagem fora do domínio da fonte (${host} não é ${domain})`;
}

/**
 * Baixa a imagem da matéria original identificado como `CityNewsBot`: só do domínio da fonte (ou
 * subdomínio), no máximo 3 redirecionamentos revalidados, bloqueio de rede interna por nome e DNS
 * (SSRF), timeout (ou o prazo do drain) e corpo lido em streaming até 10 MB. Só `image/*`
 * raster; SVG é recusado.
 */
export async function fetchImage(
  deps: { http: HttpFetch; resolve: ResolveHost; userAgent: string },
  url: string,
  opts: { sourceBaseUrl: string; signal?: AbortSignal },
): Promise<Result<DownloadedImage, string>> {
  const domain = sourceDomain(opts.sourceBaseUrl);
  if (!domain) return err(`URL da fonte inválida: ${opts.sourceBaseUrl}`);
  const res = await safeGet(deps, url, {
    headers: {
      "User-Agent": deps.userAgent,
      Accept: "image/avif, image/webp, image/jpeg, image/png, image/gif;q=0.8",
    },
    signal: deadlineSignal(FETCH_TIMEOUT_MS, opts.signal),
    maxBytes: MAX_IMAGE_BYTES,
    allowUrl: (u) => outsideSourceDomain(u, domain),
  });
  switch (res.kind) {
    case "blocked":
      return err(res.reason);
    case "network_error":
      return err(res.message);
    case "too_large":
      return err("imagem maior que 10 MB");
    case "status":
      return err(`HTTP ${res.status} em ${url}`);
    case "ok": {
      const contentType = res.headers.get("content-type");
      if (contentType && (!/^image\//i.test(contentType) || /svg/i.test(contentType)))
        return err(`conteúdo não é imagem raster: ${contentType}`);
      return ok({ url: res.url, contentType, bytes: res.body });
    }
  }
}
