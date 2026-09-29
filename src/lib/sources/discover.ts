import { parseHTML } from "linkedom";
import { discoverFeed, crawlerToken, isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet, type CrawlDeps, type CrawlResponse } from "@/lib/pipeline/http";
import type { DocumentFormat, SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries, hasEntityDeclaration } from "@/lib/pipeline/steps/extract";
import type { RawEntry } from "@/lib/pipeline/types";
import { err, ok, type Result } from "@/lib/result";
import { extractPageList } from "./page-list";
import type { ConsumptionStrategy, PageSelectors } from "./types";
import { registrableHost } from "./url";

export const MAX_DISCOVERY_REQUESTS = 8;
export const DISCOVERY_LIMIT_PER_HOUR = 20;

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
  /** URL final do documento analisado (depois de redirecionamentos). */
  finalUrl: string;
  feedUrl: string | null;
  entries: RawEntry[];
  tried: { url: string; outcome: string }[];
  robots: { allowed: boolean; crawlDelaySec: number | null };
  /** HTML da página analisada (para metadados e termos); `null` se o link era um feed. */
  html: string | null;
}

/** Caminhos tentados quando a página não anuncia o feed, nesta ordem. */
export const WELL_KNOWN_PATHS = [
  "/feed",
  "/rss",
  "/atom.xml",
  "/feed.json",
  "/sitemap-news.xml",
  "/news-sitemap.xml",
] as const;

const FEED_LINK_TYPE = /^application\/(?:rss\+xml|atom\+xml|rdf\+xml|feed\+json|json)$/i;

/** Mensagens de `urlProblem`/`safeGet` que significam rede interna ou endereço proibido (SSRF). */
export function isBlockedAddressMessage(message: string): boolean {
  return /host não permitido|resolve para endereço não permitido|esquema não permitido|credenciais|URL inválida/.test(
    message,
  );
}

const STRATEGY: Partial<Record<DocumentFormat, [ConsumptionStrategy, SourceKind]>> = {
  rss: ["rss", "rss"],
  rdf: ["rss", "rss"],
  atom: ["atom", "rss"],
  jsonfeed: ["jsonfeed", "api"],
  sitemap: ["sitemap_news", "sitemap"],
};

/** `Crawl-delay` (segundos) do grupo do nosso robô, ou do `*`. */
export function crawlDelayOf(robotsTxt: string | null, userAgent: string): number | null {
  if (!robotsTxt) return null;
  const token = crawlerToken(userAgent);
  const groups: { agents: string[]; delay: number | null }[] = [];
  let cur: { agents: string[]; delay: number | null } | null = null;
  let lastAgent = false;
  for (const raw of robotsTxt.split(/\r\n|\r|\n/)) {
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(raw.replace(/#.*$/, "").trim());
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!cur || !lastAgent) {
        cur = { agents: [], delay: null };
        groups.push(cur);
      }
      cur.agents.push(crawlerToken(value) || value.toLowerCase());
      lastAgent = true;
    } else {
      lastAgent = false;
      if (key === "crawl-delay" && cur) {
        const n = Number(value);
        if (Number.isFinite(n) && n >= 0) cur.delay = n;
      }
    }
  }
  const group =
    groups.find((g) => token && g.agents.includes(token)) ??
    groups.find((g) => g.agents.includes("*"));
  return group?.delay ?? null;
}

function robotsSitemaps(robotsTxt: string | null): string[] {
  if (!robotsTxt) return [];
  const out: string[] = [];
  for (const line of robotsTxt.split(/\r\n|\r|\n/)) {
    const m = /^sitemap\s*:\s*(\S+)/i.exec(line.trim());
    if (m) out.push(m[1]!);
  }
  return out;
}

function alternateFeeds(html: string, base: string): string[] {
  const out: string[] = [];
  try {
    const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
    for (const link of Array.from(document.querySelectorAll("link[href]"))) {
      const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
      if (
        !rel.includes("alternate") ||
        !FEED_LINK_TYPE.test((link.getAttribute("type") ?? "").trim())
      )
        continue;
      try {
        out.push(new URL(link.getAttribute("href") ?? "", base).toString());
      } catch {
        /* href inválido: ignora */
      }
    }
  } catch {
    /* HTML ilegível: sem candidatos */
  }
  return out;
}

const httpOutcome = (status: number) =>
  status === 404
    ? "não encontrado (404)"
    : status === 403
      ? "acesso negado (403)"
      : `HTTP ${status}`;

function failureOutcome(r: Exclude<CrawlResponse, { kind: "ok" }>): string {
  switch (r.kind) {
    case "http_error":
      return httpOutcome(r.status);
    case "network_error":
      return "não respondeu";
    case "too_large":
      return "resposta grande demais";
    case "rate_limited":
      return "limite de requisições atingido";
    case "not_modified":
      return "sem alteração";
  }
}

/**
 * Descobre como coletar uma fonte a partir de um link: o próprio link como feed, autodiscovery
 * na página (RSS, Atom, JSON Feed), `Sitemap:` do robots, caminhos conhecidos e, por fim, a
 * página (lista por seletores ou artigo). No máximo 8 requisições, robots respeitado, toda rede
 * por `crawlGet`/`checkRobots` (SSRF), sem corpo de matéria.
 */
export async function discoverConsumption(
  deps: CrawlDeps,
  url: URL,
  opts: { maxRequests?: number; selectors?: PageSelectors } = {},
): Promise<Result<Discovery, DiscoverError>> {
  const maxRequests = opts.maxRequests ?? MAX_DISCOVERY_REQUESTS;
  const limits = {
    bucket: `discover:${url.hostname.toLowerCase()}`,
    limitPerHour: DISCOVERY_LIMIT_PER_HOUR,
  };
  const site = registrableHost(url.hostname);
  let used = 0;
  const tried: Discovery["tried"] = [];

  // 1. robots.txt da origem (conta como requisição).
  if (used >= maxRequests) return err("unreachable");
  used++;
  const robots = await checkRobots(deps, url.toString(), limits);
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable")
    return err(isBlockedAddressMessage(robots.reason) ? "forbidden_host" : "robots_unavailable");
  if (robots.kind === "disallowed") return err("robots_disallowed");
  const robotsTxt = robots.robotsTxt;
  const robotsInfo = { allowed: true, crawlDelaySec: crawlDelayOf(robotsTxt, deps.userAgent) };
  const allowed = (u: string): boolean => {
    if (!robotsTxt) return true;
    const p = new URL(u);
    return isAllowedByRobots(robotsTxt, deps.userAgent, `${p.pathname}${p.search}`);
  };

  type Fetched =
    | { kind: "fatal"; error: DiscoverError }
    | { kind: "skip" }
    | { kind: "doc"; url: string; body: string; format: DocumentFormat | null };
  /** Uma requisição (com robots, teto e registro em `tried`). */
  const fetchDoc = async (target: string, accept?: string): Promise<Fetched> => {
    if (!allowed(target)) {
      tried.push({ url: target, outcome: "bloqueado pelo robots.txt" });
      return { kind: "skip" };
    }
    if (used >= maxRequests) return { kind: "skip" };
    used++;
    const res = await crawlGet(deps, target, { ...limits, ...(accept ? { accept } : {}) });
    if (res.kind === "rate_limited") return { kind: "fatal", error: "rate_limited" };
    if (res.kind === "network_error" && isBlockedAddressMessage(res.message))
      return { kind: "fatal", error: "forbidden_host" };
    if (res.kind !== "ok") {
      tried.push({ url: target, outcome: failureOutcome(res) });
      return { kind: "skip" };
    }
    return { kind: "doc", url: res.url, body: res.body, format: detectFormat(res.body) };
  };

  const feedResult = (
    format: DocumentFormat,
    doc: { url: string; body: string },
    html: string | null,
  ): Discovery | null => {
    const pair = STRATEGY[format];
    if (!pair) return null;
    if (format !== "jsonfeed" && hasEntityDeclaration(doc.body)) {
      tried.push({ url: doc.url, outcome: "documento recusado (declaração de entidades)" });
      return null;
    }
    let entries: RawEntry[] = [];
    try {
      entries = extractEntries(doc.body, format, doc.url);
    } catch {
      entries = [];
    }
    if (entries.length === 0) {
      tried.push({ url: doc.url, outcome: "sem itens" });
      return null;
    }
    tried.push({ url: doc.url, outcome: `${entries.length} itens` });
    return {
      strategy: pair[0],
      kind: pair[1],
      finalUrl: doc.url,
      feedUrl: doc.url,
      entries,
      tried,
      robots: robotsInfo,
      html,
    };
  };

  // 2. O próprio link.
  const first = await fetchDoc(url.toString());
  if (first.kind === "fatal") return err(first.error);
  let html: string | null = null;
  let pageUrl = url.toString();
  if (first.kind === "doc") {
    if (first.format && first.format !== "html") {
      const d = feedResult(first.format, first, null);
      if (d) return ok(d);
    } else if (first.format === "html") {
      html = first.body;
      pageUrl = first.url;
      tried.push({ url: first.url, outcome: "página HTML" });
    } else {
      tried.push({ url: first.url, outcome: "formato não reconhecido" });
    }
  }

  // 3. Candidatos: autodiscovery, Sitemap: do robots, caminhos conhecidos.
  const candidates: string[] = [];
  const add = (u: string | null) => {
    if (u && !candidates.includes(u)) candidates.push(u);
  };
  if (html) {
    alternateFeeds(html, pageUrl).forEach(add);
    add(discoverFeed(pageUrl, html)?.url ?? null);
  }
  robotsSitemaps(robotsTxt).forEach((s) => {
    try {
      add(new URL(s, url).toString());
    } catch {
      /* linha inválida */
    }
  });
  for (const p of WELL_KNOWN_PATHS) add(`${url.origin}${p}`);

  for (const c of candidates) {
    if (c === url.toString() || c === pageUrl) continue;
    if (registrableHost(new URL(c).hostname) !== site) {
      tried.push({ url: c, outcome: "outro domínio: ignorado" });
      continue;
    }
    if (used >= maxRequests) break;
    const r = await fetchDoc(c);
    if (r.kind === "fatal") return err(r.error);
    if (r.kind !== "doc") continue;
    if (!r.format || r.format === "html") {
      tried.push({ url: r.url, outcome: "formato não reconhecido" });
      continue;
    }
    const d = feedResult(r.format, r, html);
    if (d) return ok(d);
  }

  // 4. Página.
  if (html) {
    if (opts.selectors) {
      const entries = extractPageList(html, pageUrl, opts.selectors);
      if (entries.length > 0)
        return ok({
          strategy: "page_list",
          kind: "page",
          finalUrl: pageUrl,
          feedUrl: null,
          entries,
          tried,
          robots: robotsInfo,
          html,
        });
    }
    let entries: RawEntry[] = [];
    try {
      entries = extractEntries(html, "html", pageUrl);
    } catch {
      entries = [];
    }
    if (entries.length > 0)
      return ok({
        strategy: "page_article",
        kind: "page",
        finalUrl: pageUrl,
        feedUrl: null,
        entries,
        tried,
        robots: robotsInfo,
        html,
      });
    return err("nothing_found");
  }
  return err(first.kind === "doc" ? "nothing_found" : "unreachable");
}
