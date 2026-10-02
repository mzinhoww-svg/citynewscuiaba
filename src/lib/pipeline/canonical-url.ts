/** Parâmetros de rastreamento removidos da URL canônica. */
const TRACKING = new Set([
  "fbclid",
  "gclid",
  "gclsrc",
  "dclid",
  "msclkid",
  "yclid",
  "igshid",
  "mc_cid",
  "mc_eid",
  "_hsenc",
  "_hsmi",
]);

/**
 * URL canônica de um item coletado (chave única de `collected_items`): https, host minúsculo,
 * sem usuário, porta padrão, fragmento, `utm_*`, `fbclid`, `gclid` e afins, sem barra final e
 * com os parâmetros restantes em ordem. `base` resolve links relativos do feed.
 * Lança `TypeError` para URL inválida ou esquema diferente de http(s).
 */
export function canonicalUrl(u: string, base?: string): string {
  const url = new URL(u.trim(), base);
  if (url.protocol !== "http:" && url.protocol !== "https:")
    throw new TypeError(`esquema não permitido: ${url.protocol}`);
  const port = url.port && url.port !== "80" && url.port !== "443" ? `:${url.port}` : "";
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!host) throw new TypeError("URL sem host");

  const params = [...url.searchParams.entries()]
    .filter(([k]) => !k.toLowerCase().startsWith("utm_") && !TRACKING.has(k.toLowerCase()))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const search = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";
  const path = url.pathname.replace(/\/+$/, "");
  return `https://${host}${port}${path}${search}`;
}

/** Versão que não lança: `null` quando a URL não serve. */
export function tryCanonicalUrl(u: string, base?: string): string | null {
  try {
    return canonicalUrl(u, base);
  } catch {
    return null;
  }
}
