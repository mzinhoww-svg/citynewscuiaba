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

const CATEGORY_LABELS = new Set(["com", "gov", "org", "net", "edu", "jus", "mp", "leg"]);

/**
 * Domínio registrável simples: últimos 2 rótulos, ou últimos 3 quando o penúltimo é um rótulo de
 * categoria (com, gov, org, net, edu, jus, mp, leg) e o último tem 2 letras (ex.: ebc.com.br).
 */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const last = labels[labels.length - 1] ?? "";
  const prev = labels[labels.length - 2] ?? "";
  const n = CATEGORY_LABELS.has(prev) && last.length === 2 ? 3 : 2;
  return labels.slice(-n).join(".");
}

/**
 * Motivo para recusar a imagem fora do domínio da fonte, ou `null` se é dela: o próprio domínio,
 * um subdomínio ou outro host do mesmo domínio registrável (CDN do mesmo veículo).
 */
export function outsideSourceDomain(url: URL, domain: string): string | null {
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (host === domain || host.endsWith(`.${domain}`)) return null;
  const reg = registrableDomain(domain);
  if (reg.includes(".") && registrableDomain(host) === reg) return null;
  return `imagem fora do domínio da fonte (${host} não é ${domain})`;
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
