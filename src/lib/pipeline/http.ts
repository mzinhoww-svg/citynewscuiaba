import type { HttpFetch, IngestRepo } from "./ports";
import { decodeBody } from "./charset";
import { isAllowedByRobots } from "./crawl";
import { deadlineSignal, safeGet, urlProblem, type ResolveHost } from "./net";

export { isForbiddenHost } from "./net";

export const DEFAULT_USER_AGENT = "CityNewsBot/1.0 (+https://citynewscuiaba.vercel.app/sobre#robo)";
export const FETCH_TIMEOUT_MS = 10_000;
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

export function crawlerUserAgent(): string {
  return process.env.CRAWLER_USER_AGENT?.trim() || DEFAULT_USER_AGENT;
}

/**
 * `net.ts` (intocado) devolve o mesmo formato "blocked"/"network_error" tanto para uma recusa de
 * política (esquema, credenciais, host proibido, DNS que resolve para IP privado) quanto para uma
 * falha de rede comum sobre a mesma checagem (DNS fora do ar, cadeia de redirecionamento longa
 * demais, `Location` inválido). Como não editamos `net.ts`, a única forma de separar as duas sem
 * inspecionar texto arbitrário é reconhecer o vocabulário fixo que `urlProblem`/`safeGet` usam para
 * as recusas de política (fix round 2, achado N1/#5). Nunca casa texto vindo de conteúdo de
 * terceiros: essas mensagens são só as que `net.ts` mesmo produz.
 */
const POLICY_BLOCK_PATTERNS: RegExp[] = [
  /^esquema não permitido:/,
  /^URL com credenciais não é permitida$/,
  /^host não permitido:/,
  // Ancorado à forma exata de `urlProblem` (net.ts): um `Location` de terceiro que repete a
  // frase entra em "redirecionamento inválido: …" e não pode casar aqui (FS-T9).
  /^host \S+ resolve para endereço não permitido/,
];

function isPolicyBlock(reason: string): boolean {
  return POLICY_BLOCK_PATTERNS.some((re) => re.test(reason));
}

/** Só nosso: nunca aparece numa mensagem real de `net.ts`, então dá para comparar por igualdade. */
const RATE_LIMIT_HOP_SENTINEL = "__citynews_http_rate_limited_hop__";

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
      /** Só presente (`true`) quando `prefixBytes` cortou o corpo (sitemap). */
      truncated?: true;
    }
  | { kind: "not_modified" }
  | { kind: "http_error"; status: number }
  /**
   * `blocked` é `true` só para uma recusa de política: esquema errado, credenciais na URL, host
   * proibido por nome, DNS que resolve para IP privado/reservado, ou o próprio `onHop` do chamador
   * recusando o salto (ele existe exatamente para impor política extra, como "mesmo site"). DNS
   * fora do ar, timeout, conexão recusada, cadeia de redirecionamento longa demais e `Location`
   * inválido são falhas de rede comuns, nunca `blocked` (fix round 2, achado N1/#5) — quem precisa
   * dessa distinção decide o que fazer com cada uma; quem só lê `message` não muda de comportamento.
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
     * Só para sitemap: lê o corpo até este número de bytes e devolve o prefixo com
     * `truncated: true` (o resto do arquivo nem é baixado). Sem a opção, o limite de
     * `MAX_DOCUMENT_BYTES` e o `too_large` de sempre.
     */
    prefixBytes?: number;
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
  if (problem) return { kind: "network_error", message: problem, blocked: isPolicyBlock(problem) };

  const headers: Record<string, string> = {
    "User-Agent": deps.userAgent,
    Accept:
      opts.accept ??
      "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, application/feed+json;q=0.8, application/json;q=0.7, text/html;q=0.5, */*;q=0.1",
  };
  if (opts.etag) headers["If-None-Match"] = opts.etag;
  if (opts.lastModified) headers["If-Modified-Since"] = opts.lastModified;

  // Sem `onHop`: comportamento de sempre, uma cota da hora por chamada, cobrada antes do pedido
  // (compatibilidade com quem já usa `crawlGet`, spec de fix round 2 "keep existing behavior").
  let http = deps.http;
  let blockedByHook = false;
  if (opts.onHop) {
    // Com `onHop`: a cota é cobrada a cada salto de verdade (achado N3), imediatamente antes
    // daquele pedido — nunca depois. `deps.http` só é chamado por `safeGet` quando `urlProblem` e
    // `allowUrl` (que embrulha `onHop`, abaixo) já deixaram passar aquele salto; embrulhando
    // `deps.http` em vez de `deps.repo.hitRateLimit` fora do loop, a cobrança acontece no mesmo
    // lugar exato em que o pedido de verdade sairia, e nunca depois dele.
    http = async (input, init) => {
      if (!(await deps.repo.hitRateLimit(opts.bucket, opts.limitPerHour)))
        throw new Error(RATE_LIMIT_HOP_SENTINEL);
      return deps.http(input, init);
    };
  } else if (!(await deps.repo.hitRateLimit(opts.bucket, opts.limitPerHour))) {
    return { kind: "rate_limited" };
  }

  const res = await safeGet({ http, resolve: deps.resolve }, url, {
    headers,
    signal: deadlineSignal(FETCH_TIMEOUT_MS, opts.signal),
    maxBytes: MAX_DOCUMENT_BYTES,
    prefixBytes: opts.prefixBytes,
    allowUrl: opts.onHop
      ? (u) => {
          const reason = opts.onHop!(u);
          if (reason !== null) blockedByHook = true;
          return reason;
        }
      : undefined,
  });
  switch (res.kind) {
    case "blocked":
      return {
        kind: "network_error",
        message: res.reason,
        blocked: blockedByHook || isPolicyBlock(res.reason),
      };
    case "network_error":
      if (res.message === RATE_LIMIT_HOP_SENTINEL) return { kind: "rate_limited" };
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
        body: decodeBody(res.body, res.headers.get("content-type")),
        contentType: res.headers.get("content-type"),
        etag: res.headers.get("etag"),
        lastModified: res.headers.get("last-modified"),
        ...(res.truncated ? { truncated: true as const } : {}),
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
