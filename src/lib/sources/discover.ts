/**
 * Descoberta por link (spec §7.1 passos 3-6): a partir da URL colada, decide como a fonte será
 * consumida. Ordem: o próprio link (se já for feed) → autodiscovery (RSS, Atom, JSON Feed) na
 * página inicial → `Sitemap:` do `robots.txt` → caminhos conhecidos → página (artigo ou lista,
 * quando `selectors` for informado). Nunca `fetch` direto: tudo passa por `crawlGet`/`checkRobots`
 * (SSRF em `pipeline/net.ts`), no máximo `opts.maxRequests` requisições (padrão 8), bucket
 * `discover:<host>` a 20/h.
 */
import { parseHTML } from "linkedom";
import { err, ok, type Result } from "@/lib/result";
import { discoverFeed, isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import type { DocumentFormat, SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries, extractFromPage } from "@/lib/pipeline/steps/extract";
import type { RawEntry } from "@/lib/pipeline/types";
import { extractPageList } from "./page-list";
import type { ConsumptionStrategy, PageSelectors } from "./types";

export type DiscoverError =
  | "forbidden_host"
  | "robots_disallowed"
  | "robots_unavailable"
  | "nothing_found"
  | "rate_limited"
  | "unreachable";

export interface Discovery {
  strategy: ConsumptionStrategy;
  kind: SourceKind;
  feedUrl: string | null;
  entries: RawEntry[];
  /** Um item por candidato tentado, na ordem, com o motivo em pt-BR. */
  tried: { url: string; outcome: string }[];
  robots: { allowed: boolean; crawlDelaySec: number | null };
  html: string | null;
}

const DEFAULT_MAX_REQUESTS = 8;
const DISCOVER_LIMIT_PER_HOUR = 20;

/** Ordem dos caminhos conhecidos quando não há autodiscovery nem `Sitemap:` no `robots.txt`. */
export const WELL_KNOWN_PATHS = [
  "/feed",
  "/rss",
  "/atom.xml",
  "/feed.json",
  "/sitemap-news.xml",
  "/news-sitemap.xml",
] as const;

/** Mensagens que `urlProblem`/`safeGet` produzem para bloqueio de política (SSRF), nunca falha de rede comum. */
const SSRF_BLOCKED =
  /não permitid|resolve para endere[cç]o n[aã]o permitido|redirecionamentos|redirecionamento inv[aá]lido|credenciais|DNS falhou|DNS sem endere[cç]o/i;

function strategyFor(
  format: DocumentFormat,
): { kind: SourceKind; strategy: ConsumptionStrategy } | null {
  switch (format) {
    case "rss":
    case "rdf":
      return { kind: "rss", strategy: "rss" };
    case "atom":
      return { kind: "rss", strategy: "atom" };
    case "jsonfeed":
      return { kind: "api", strategy: "jsonfeed" };
    case "sitemap":
      return { kind: "sitemap", strategy: "sitemap_news" };
    case "html":
      return null;
  }
}

/** `link rel=alternate type=application/feed+json|application/json` na página inicial. */
function jsonFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  for (const link of document.querySelectorAll("link[href]")) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    const type = (link.getAttribute("type") ?? "").trim().toLowerCase();
    if (!rel.includes("alternate")) continue;
    if (type !== "application/feed+json" && type !== "application/json") continue;
    try {
      const url = new URL(link.getAttribute("href")!, baseUrl);
      if (url.protocol === "http:" || url.protocol === "https:") return url.toString();
    } catch {
      /* href inválido: ignora */
    }
  }
  return null;
}

/** Primeira linha `Sitemap:` do `robots.txt`, resolvida contra a origem. */
function sitemapFromRobots(robotsTxt: string | null, baseUrl: string): string | null {
  if (!robotsTxt) return null;
  const m = /^\s*sitemap\s*:\s*(\S+)/im.exec(robotsTxt);
  if (!m) return null;
  try {
    const url = new URL(m[1]!, baseUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** `Crawl-delay` do grupo do nosso robô, ou do `*` na falta dele; `null` sem diretiva. */
export function crawlDelayFromRobots(robotsTxt: string | null, userAgent: string): number | null {
  if (!robotsTxt) return null;
  const token = (/^[A-Za-z0-9_-]+/.exec(userAgent.trim())?.[0] ?? "").toLowerCase();
  let agents: string[] = [];
  let freshGroup = true;
  let mine: number | null = null;
  let wildcard: number | null = null;
  for (const raw of robotsTxt.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (freshGroup) agents = [];
      agents.push(value.toLowerCase());
      freshGroup = true;
    } else if (key === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) {
        if (agents.includes(token)) mine = n;
        if (agents.includes("*")) wildcard = n;
      }
      freshGroup = false;
    } else {
      freshGroup = false;
    }
  }
  return mine ?? wildcard;
}

type Attempt =
  | { kind: "feed"; strategy: ConsumptionStrategy; sourceKind: SourceKind; entries: RawEntry[] }
  | { kind: "html" }
  | { kind: "forbidden" }
  | { kind: "rate_limited" }
  | { kind: "miss" };

/**
 * Descoberta a partir da URL colada. Falha só em `forbidden_host`, `robots_disallowed`,
 * `robots_unavailable` ou `rate_limited`; do contrário devolve o que encontrou, com `tried`
 * contando o caminho de cada candidato.
 */
export async function discoverConsumption(
  deps: CrawlDeps,
  url: URL,
  opts?: { maxRequests?: number; selectors?: PageSelectors },
): Promise<Result<Discovery, DiscoverError>> {
  const maxRequests = opts?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const limits = {
    bucket: `discover:${url.hostname.toLowerCase()}`,
    limitPerHour: DISCOVER_LIMIT_PER_HOUR,
  };

  const robots = await checkRobots(deps, url.toString(), limits);
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable") return err("robots_unavailable");
  if (robots.kind === "disallowed") return err("robots_disallowed");
  const robotsTxt = robots.robotsTxt;

  const allowed = (target: string): boolean => {
    if (!robotsTxt) return true;
    const u = new URL(target);
    return isAllowedByRobots(robotsTxt, deps.userAgent, `${u.pathname}${u.search}`);
  };

  let requestsUsed = 1; // robots.txt
  const tried: { url: string; outcome: string }[] = [];
  /** Primeiro HTML válido encontrado (a página em si): base do fallback `page_article`/`page_list`. */
  let home: { url: string; html: string } | null = null;

  const attempt = async (target: string): Promise<Attempt> => {
    if (!allowed(target)) {
      tried.push({ url: target, outcome: "robots.txt não permite este caminho" });
      return { kind: "miss" };
    }
    if (requestsUsed >= maxRequests) return { kind: "miss" };
    requestsUsed++;
    const res = await crawlGet(deps, target, limits);
    switch (res.kind) {
      case "rate_limited":
        tried.push({ url: target, outcome: "limite de requisições por hora atingido" });
        return { kind: "rate_limited" };
      case "http_error":
        tried.push({ url: target, outcome: `HTTP ${res.status}` });
        return { kind: "miss" };
      case "network_error":
        tried.push({ url: target, outcome: `falha de rede: ${res.message}` });
        return SSRF_BLOCKED.test(res.message) ? { kind: "forbidden" } : { kind: "miss" };
      case "too_large":
        tried.push({ url: target, outcome: "documento grande demais" });
        return { kind: "miss" };
      case "not_modified":
        tried.push({ url: target, outcome: "sem conteúdo novo" });
        return { kind: "miss" };
      case "ok": {
        const format = detectFormat(res.body);
        if (!format) {
          tried.push({ url: target, outcome: "formato não reconhecido" });
          return { kind: "miss" };
        }
        if (format === "html") {
          if (!home) home = { url: target, html: res.body };
          tried.push({ url: target, outcome: "página sem feed anunciado" });
          return { kind: "html" };
        }
        const mapped = strategyFor(format)!;
        const entries = extractEntries(res.body, format, target);
        if (entries.length === 0) {
          tried.push({ url: target, outcome: "nenhum item extraído" });
          return { kind: "miss" };
        }
        tried.push({ url: target, outcome: "ok" });
        return { kind: "feed", strategy: mapped.strategy, sourceKind: mapped.kind, entries };
      }
    }
  };

  const finish = (feedUrl: string, a: Extract<Attempt, { kind: "feed" }>): Discovery => ({
    strategy: a.strategy,
    kind: a.sourceKind,
    feedUrl,
    entries: a.entries,
    tried,
    robots: { allowed: true, crawlDelaySec: crawlDelayFromRobots(robotsTxt, deps.userAgent) },
    html: home?.html ?? null,
  });

  const target = url.toString();
  const first = await attempt(target);
  if (first.kind === "rate_limited") return err("rate_limited");
  if (first.kind === "forbidden") return err("forbidden_host");
  if (first.kind === "feed") return ok(finish(target, first));
  if (first.kind === "miss" && !home) {
    // Nem feed nem página: link não respondeu de forma utilizável logo de cara.
    const wasNetworkFailure = tried.at(-1)?.outcome.startsWith("falha de rede");
    if (wasNetworkFailure) return err("unreachable");
  }

  const pageAfterFeedSearch = home as { url: string; html: string } | null;
  if (pageAfterFeedSearch) {
    const jsonLink = jsonFeedLinkFromHtml(pageAfterFeedSearch.html, pageAfterFeedSearch.url);
    const found = discoverFeed(pageAfterFeedSearch.url, pageAfterFeedSearch.html);
    const link = jsonLink ?? found?.url ?? null;
    if (link) {
      const r = await attempt(link);
      if (r.kind === "rate_limited") return err("rate_limited");
      if (r.kind === "forbidden") return err("forbidden_host");
      if (r.kind === "feed") return ok(finish(link, r));
    }
  }

  const sitemapUrl = sitemapFromRobots(robotsTxt, target);
  if (sitemapUrl) {
    const r = await attempt(sitemapUrl);
    if (r.kind === "rate_limited") return err("rate_limited");
    if (r.kind === "forbidden") return err("forbidden_host");
    if (r.kind === "feed") return ok(finish(sitemapUrl, r));
  }

  const origin = new URL(target).origin;
  for (const path of WELL_KNOWN_PATHS) {
    const candidate = `${origin}${path}`;
    const r = await attempt(candidate);
    if (r.kind === "rate_limited") return err("rate_limited");
    if (r.kind === "forbidden") return err("forbidden_host");
    if (r.kind === "feed") return ok(finish(candidate, r));
  }

  const pageForFallback = home as { url: string; html: string } | null;
  if (pageForFallback) {
    if (opts?.selectors) {
      const items = extractPageList(pageForFallback.html, pageForFallback.url, opts.selectors);
      if (items.length > 0) {
        return ok({
          strategy: "page_list",
          kind: "page",
          feedUrl: pageForFallback.url,
          entries: items,
          tried,
          robots: { allowed: true, crawlDelaySec: crawlDelayFromRobots(robotsTxt, deps.userAgent) },
          html: pageForFallback.html,
        });
      }
    }
    const entries = extractFromPage(pageForFallback.html, pageForFallback.url);
    return ok({
      strategy: "page_article",
      kind: "page",
      feedUrl: null,
      entries,
      tried,
      robots: { allowed: true, crawlDelaySec: crawlDelayFromRobots(robotsTxt, deps.userAgent) },
      html: pageForFallback.html,
    });
  }

  return err("nothing_found");
}

/** Nome e descrição do site (título, `og:site_name`, meta descrição) para a prévia. */
export function siteMeta(html: string): { siteName: string | null; description: string | null } {
  const { document } = parseHTML(html);
  const meta = (selector: string): string =>
    document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  const siteName =
    meta('meta[property="og:site_name"]') ||
    document.querySelector("title")?.textContent?.trim() ||
    "";
  const description =
    meta('meta[name="description"]') || meta('meta[property="og:description"]') || "";
  return { siteName: siteName || null, description: description || null };
}
