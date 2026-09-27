import type { HttpFetch, IngestRepo } from "./ports";
import { isAllowedByRobots } from "./crawl";

export const DEFAULT_USER_AGENT = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function crawlerUserAgent(): string {
  return process.env.CRAWLER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

export interface CrawlDeps {
  repo: Pick<IngestRepo, "hitRateLimit">;
  http: HttpFetch;
  userAgent: string;
}

export type CrawlResponse =
  | {
      kind: "ok";
      url: string;
      status: number;
      body: string;
      contentType: string | null;
      etag: string | null;
      lastModified: string | null;
    }
  | { kind: "not_modified" }
  | { kind: "http_error"; status: number }
  | { kind: "network_error"; message: string }
  | { kind: "too_large" }
  | { kind: "rate_limited" };

/** Hosts que o coletor nunca acessa (SSRF): loopback, rede privada, link-local, nomes internos. */
export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h.endsWith(".internal")
  )
    return true;
  if (h.includes(":"))
    return h === "::1" || h === "::" || /^(?:fc|fd|fe8|fe9|fea|feb|::ffff:)/.test(h);
  const v4 = /^(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

/**
 * GET identificado como `CityNewsBot`, com timeout de 10 s, limite de tamanho, limite por hora
 * da fonte (`rate_limits`, bucket `crawler:<slug>`) e coleta condicional (ETag/Last-Modified).
 */
export async function crawlGet(
  deps: CrawlDeps,
  url: string,
  opts: {
    bucket: string;
    limitPerHour: number;
    etag?: string | null;
    lastModified?: string | null;
    accept?: string;
  },
): Promise<CrawlResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "network_error", message: `URL inválida: ${url}` };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    return { kind: "network_error", message: `esquema não permitido: ${parsed.protocol}` };
  if (isForbiddenHost(parsed.hostname))
    return { kind: "network_error", message: `host não permitido: ${parsed.hostname}` };
  if (!(await deps.repo.hitRateLimit(opts.bucket, opts.limitPerHour)))
    return { kind: "rate_limited" };

  const headers: Record<string, string> = {
    "User-Agent": deps.userAgent,
    Accept:
      opts.accept ??
      "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/feed+json;q=0.8, application/json;q=0.7, text/html;q=0.5, */*;q=0.1",
  };
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;

  let res: Response;
  try {
    res = await deps.http(url, {
      headers,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
  } catch (e) {
    return { kind: "network_error", message: e instanceof Error ? e.message : String(e) };
  }
  if (res.status === 304) return { kind: "not_modified" };
  if (res.status < 200 || res.status >= 300) return { kind: "http_error", status: res.status };
  const declared = Number(res.headers.get("content-length") ?? "0");
  if (declared > MAX_DOCUMENT_BYTES) return { kind: "too_large" };
  let body: string;
  try {
    body = await res.text();
  } catch (e) {
    return { kind: "network_error", message: e instanceof Error ? e.message : String(e) };
  }
  if (body.length > MAX_DOCUMENT_BYTES) return { kind: "too_large" };
  return {
    kind: "ok",
    url: res.url || url,
    status: res.status,
    body,
    contentType: res.headers.get("content-type"),
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

export type RobotsVerdict =
  | { kind: "allowed"; robotsTxt: string | null }
  | { kind: "disallowed"; reason: string; robotsTxt: string }
  | { kind: "unavailable"; reason: string }
  | { kind: "rate_limited" };

/**
 * Lê o robots.txt da origem de `url` e diz se `url` pode ser coletada. 4xx = sem restrição;
 * 5xx ou falha de rede = indisponível (não coletar agora, RFC 9309 §2.3.1.4).
 */
export async function checkRobots(
  deps: CrawlDeps,
  url: string,
  opts: { bucket: string; limitPerHour: number },
): Promise<RobotsVerdict> {
  const target = new URL(url);
  const robotsUrl = `${target.protocol}//${target.host}/robots.txt`;
  const res = await crawlGet(deps, robotsUrl, { ...opts, accept: "text/plain, */*;q=0.1" });
  switch (res.kind) {
    case "rate_limited":
      return { kind: "rate_limited" };
    case "http_error":
      return res.status >= 500 || res.status === 429
        ? { kind: "unavailable", reason: `robots.txt indisponível (HTTP ${res.status})` }
        : { kind: "allowed", robotsTxt: null };
    case "network_error":
      return { kind: "unavailable", reason: `robots.txt indisponível: ${res.message}` };
    case "too_large":
    case "not_modified":
      return { kind: "allowed", robotsTxt: null };
    case "ok": {
      const path = `${target.pathname}${target.search}`;
      return isAllowedByRobots(res.body, deps.userAgent, path)
        ? { kind: "allowed", robotsTxt: res.body }
        : { kind: "disallowed", reason: `robots.txt bloqueia ${path}`, robotsTxt: res.body };
    }
  }
}
