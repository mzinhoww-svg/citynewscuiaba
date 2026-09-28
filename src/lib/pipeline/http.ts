import type { HttpFetch, IngestRepo } from "./ports";
import { isAllowedByRobots } from "./crawl";
import { deadlineSignal, safeGet, urlProblem, type ResolveHost } from "./net";

export { isForbiddenHost } from "./net";

export const DEFAULT_USER_AGENT = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function crawlerUserAgent(): string {
  return process.env.CRAWLER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

export interface CrawlDeps {
  repo: Pick<IngestRepo, "hitRateLimit">;
  http: HttpFetch;
  /** DNS (todos os endereços): produção `systemResolve`, testes `fakeResolve`. */
  resolve: ResolveHost;
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
  /**
   * `blocked` distingue, sem depender do texto da mensagem, uma recusa de política (esquema, host,
   * DNS proibido ou `onHop`) de uma falha de rede de verdade (timeout, conexão recusada). Opcional
   * e aditivo: quem já lia só `message` continua funcionando sem mudança.
   */
  | { kind: "network_error"; message: string; blocked?: boolean }
  | { kind: "too_large" }
  | { kind: "rate_limited" };

/**
 * GET identificado como `CityNewsBot`, com timeout de 10 s (ou o prazo do drain, o que vier
 * antes), no máximo 3 redirecionamentos revalidados, bloqueio de rede interna por nome e por DNS
 * (SSRF), corpo lido em streaming até 5 MB, limite por hora da fonte (`rate_limits`, bucket
 * `crawler:<slug>`) e coleta condicional (ETag/Last-Modified).
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
    signal?: AbortSignal;
    /**
     * Chamado antes de cada salto real (o pedido inicial e cada redirecionamento seguido), na
     * ordem. Devolver um motivo interrompe a cadeia ali, sem chegar a fazer aquele salto (e sem
     * contar para o limite por hora); devolver `null` deixa seguir. Opcional: quem não passa
     * `onHop` tem o comportamento de sempre, um pedido por chamada de `crawlGet`.
     */
    onHop?: (url: URL) => string | null;
  },
): Promise<CrawlResponse> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { kind: "network_error", message: `URL inválida: ${url}` };
  }
  const problem = await urlProblem(parsed, deps.resolve);
  if (problem) return { kind: "network_error", message: problem, blocked: true };
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

  // O primeiro salto já foi contado por `onHop` (o segundo membro do `??`, abaixo); os saltos
  // seguintes (redirecionamentos) só existem se `onHop` deixar `safeGet` segui-los.
  let hops = 0;
  const res = await safeGet(deps, url, {
    headers,
    signal: deadlineSignal(FETCH_TIMEOUT_MS, opts.signal),
    maxBytes: MAX_DOCUMENT_BYTES,
    allowUrl: opts.onHop
      ? (u) => {
          const reason = opts.onHop!(u);
          if (reason === null) hops++;
          return reason;
        }
      : undefined,
  });
  // Acerta o limite por hora pelos saltos de verdade (spec §7.1.3): o primeiro já foi contado
  // acima; cada redirecionamento seguido consome mais uma cota da mesma janela. Só quando o
  // chamador pediu `onHop` — sem ele, o comportamento é o de sempre (uma cota por chamada).
  if (opts.onHop && hops > 1) {
    for (let i = 1; i < hops; i++) await deps.repo.hitRateLimit(opts.bucket, opts.limitPerHour);
  }
  switch (res.kind) {
    case "blocked":
      return { kind: "network_error", message: res.reason, blocked: true };
    case "network_error":
      return res;
    case "too_large":
      return res;
    case "status":
      return res.status === 304
        ? { kind: "not_modified" }
        : { kind: "http_error", status: res.status };
    case "ok":
      return {
        kind: "ok",
        url: res.url,
        status: res.status,
        body: new TextDecoder().decode(res.body),
        contentType: res.headers.get("content-type"),
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
      };
  }
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
  opts: {
    bucket: string;
    limitPerHour: number;
    signal?: AbortSignal;
    onHop?: (url: URL) => string | null;
  },
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
