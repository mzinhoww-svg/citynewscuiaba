import "server-only";
import { FETCH_TIMEOUT_MS } from "@/lib/pipeline/http";
import { isAllowedByRobots } from "@/lib/pipeline/crawl";
import { deadlineSignal, safeGet, type ResolveHost } from "@/lib/pipeline/net";
import type { HttpFetch } from "@/lib/pipeline/ports";
import { err, ok, type Result } from "@/lib/result";
import {
  candidatesFromManifest,
  manifestUrlOf,
  pickLogoCandidates,
  profileImageOf,
  socialProfileUrls,
  wellKnownLogoUrls,
  type LogoCandidateKind,
} from "./logo-discover";
import { normalizeLogo, type NormalizedLogo } from "./logo-image";

/** Teto de download de cada imagem candidata (as proteções do `fetch-image`). */
export const LOGO_DOWNLOAD_MAX_BYTES = 2 * 1024 * 1024;
const PAGE_PREFIX_BYTES = 400 * 1024;
const MANIFEST_MAX_BYTES = 128 * 1024;
const ROBOTS_MAX_BYTES = 512 * 1024;
/** Tentativas de download por fonte: protege a cota da função e a gentileza com o site. */
const MAX_IMAGE_ATTEMPTS = 14;

export interface LogoFetchDeps {
  http: HttpFetch;
  resolve: ResolveHost;
  userAgent: string;
}

export type FoundLogoKind = LogoCandidateKind | "well-known" | "social";

export interface FoundLogo extends NormalizedLogo {
  originUrl: string;
  kind: FoundLogoKind;
}

export interface LogoAttempt {
  url: string;
  kind: FoundLogoKind;
  /** Por que não serviu (`square`, `small`, `type`, `http 404`…). */
  result: string;
}

export type LogoFailure = {
  reason: "robots" | "page_unreachable" | "no_logo";
  attempts: LogoAttempt[];
};

const text = (bytes: Uint8Array): string =>
  new TextDecoder("utf-8", { fatal: false }).decode(bytes);
const HTML_ACCEPT = "text/html, application/xhtml+xml;q=0.9, */*;q=0.1";
const IMAGE_ACCEPT = "image/png, image/webp, image/jpeg, image/x-icon, image/*;q=0.8";

async function get(
  deps: LogoFetchDeps,
  url: string,
  o: { accept: string; maxBytes: number; prefix?: boolean; signal?: AbortSignal },
) {
  return safeGet(deps, url, {
    headers: { "User-Agent": deps.userAgent, Accept: o.accept },
    signal: deadlineSignal(FETCH_TIMEOUT_MS, o.signal),
    maxBytes: o.maxBytes,
    ...(o.prefix ? { prefixBytes: o.maxBytes } : {}),
  });
}

/**
 * `robots.txt` do host: 2xx lido; 4xx = sem regras; 5xx = proibido (RFC 9309); falha de rede
 * (a própria página dirá se o site está de pé) segue sem regras.
 */
async function robotsFor(deps: LogoFetchDeps, pageUrl: URL, signal?: AbortSignal) {
  const r = await get(deps, `${pageUrl.origin}/robots.txt`, {
    accept: "text/plain, */*;q=0.1",
    maxBytes: ROBOTS_MAX_BYTES,
    signal,
  });
  const body = r.kind === "ok" ? text(r.body) : "";
  const denyAll = r.kind === "status" && r.status >= 500;
  return (path: string): boolean => !denyAll && isAllowedByRobots(body, deps.userAgent, path);
}

/** Baixa um candidato (qualquer host público; SSRF e redirecionamentos revalidados) e normaliza. */
async function tryImage(
  deps: LogoFetchDeps,
  url: string,
  kind: FoundLogoKind,
  attempts: LogoAttempt[],
  signal?: AbortSignal,
): Promise<FoundLogo | null> {
  const note = (result: string) => attempts.push({ url, kind, result });
  const res = await get(deps, url, {
    accept: IMAGE_ACCEPT,
    maxBytes: LOGO_DOWNLOAD_MAX_BYTES,
    signal,
  });
  switch (res.kind) {
    case "blocked":
      note(`bloqueada: ${res.reason}`);
      return null;
    case "network_error":
      note(`rede: ${res.message}`);
      return null;
    case "too_large":
      note("maior que 2 MB");
      return null;
    case "status":
      note(`http ${res.status}`);
      return null;
    case "ok": {
      const type = res.headers.get("content-type");
      if (type && /svg/i.test(type)) {
        note("svg");
        return null;
      }
      const norm = await normalizeLogo(res.body);
      if (!norm.ok) {
        note(norm.error);
        return null;
      }
      return { ...norm.value, originUrl: res.url, kind };
    }
  }
}

/**
 * Procura o logotipo de uma fonte na internet (R27), do mais confiável ao menos: o que o próprio
 * site declara na página inicial (`apple-touch-icon`, `icon`, `og:logo`, manifest, JSON-LD,
 * `og:image` quadrada), caminhos conhecidos do domínio e, por último, a imagem de perfil dos
 * perfis oficiais que a página aponta. `robots.txt` vale para a página e para tudo que é buscado
 * em página (os caminhos conhecidos e os perfis); a imagem em si é um recurso da página. O
 * primeiro arquivo que `validateLogo` aceita (depois de converter ICO/JPEG/GIF) vence.
 */
export async function discoverSourceLogo(
  deps: LogoFetchDeps,
  baseUrl: string,
  opts: { signal?: AbortSignal } = {},
): Promise<Result<FoundLogo, LogoFailure>> {
  const attempts: LogoAttempt[] = [];
  const fail = (reason: LogoFailure["reason"]) => err<LogoFailure>({ reason, attempts });
  let page: URL;
  try {
    page = new URL(baseUrl);
  } catch {
    return fail("page_unreachable");
  }

  const allowed = await robotsFor(deps, page, opts.signal);
  if (!allowed(page.pathname + page.search)) return fail("robots");

  const home = await get(deps, page.toString(), {
    accept: HTML_ACCEPT,
    maxBytes: PAGE_PREFIX_BYTES,
    prefix: true,
    signal: opts.signal,
  });
  if (home.kind !== "ok") return fail("page_unreachable");
  const html = text(home.body);
  const finalUrl = home.url;

  let manifest: { url: string; json: unknown } | undefined;
  const manifestUrl = manifestUrlOf(html, finalUrl);
  if (manifestUrl) {
    const m = await get(deps, manifestUrl, {
      accept: "application/manifest+json, application/json, */*;q=0.1",
      maxBytes: MANIFEST_MAX_BYTES,
      signal: opts.signal,
    });
    if (m.kind === "ok") {
      try {
        manifest = { url: m.url, json: JSON.parse(text(m.body)) };
      } catch {
        /* manifest quebrado: segue sem ele */
      }
    }
  }

  const tried = new Set<string>();
  let count = 0;
  const attempt = async (url: string, kind: FoundLogoKind): Promise<FoundLogo | null> => {
    if (tried.has(url) || count >= MAX_IMAGE_ATTEMPTS) return null;
    tried.add(url);
    count++;
    return tryImage(deps, url, kind, attempts, opts.signal);
  };

  for (const c of pickLogoCandidates(html, finalUrl, { manifest })) {
    const found = await attempt(c.url, c.kind);
    if (found) return ok(found);
  }
  // Os candidatos da página cabem em 5; o manifest costuma ter mais ícones grandes.
  for (const c of manifest ? candidatesFromManifest(manifest.json, manifest.url) : []) {
    const found = await attempt(c.url, "manifest");
    if (found) return ok(found);
  }
  for (const url of wellKnownLogoUrls(finalUrl)) {
    if (!allowed(new URL(url).pathname)) continue;
    const found = await attempt(url, "well-known");
    if (found) return ok(found);
  }

  for (const profile of socialProfileUrls(html, finalUrl)) {
    if (count >= MAX_IMAGE_ATTEMPTS) break;
    const profileUrl = new URL(profile);
    const socialAllowed = await robotsFor(deps, profileUrl, opts.signal);
    if (!socialAllowed(profileUrl.pathname)) {
      attempts.push({ url: profile, kind: "social", result: "robots" });
      continue;
    }
    const res = await get(deps, profile, {
      accept: HTML_ACCEPT,
      maxBytes: PAGE_PREFIX_BYTES,
      prefix: true,
      signal: opts.signal,
    });
    if (res.kind !== "ok") {
      attempts.push({ url: profile, kind: "social", result: "página indisponível" });
      continue;
    }
    const image = profileImageOf(text(res.body), res.url);
    if (!image) {
      attempts.push({ url: profile, kind: "social", result: "sem imagem de perfil" });
      continue;
    }
    const found = await attempt(image, "social");
    if (found) return ok(found);
  }
  return fail("no_logo");
}
