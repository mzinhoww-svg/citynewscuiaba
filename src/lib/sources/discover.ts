/**
 * Descoberta por link (spec §7.1.3): a partir da URL colada, decide como a fonte será consumida.
 * Ordem: o próprio link (se já for feed) → autodiscovery (RSS/Atom) na página inicial → `Sitemap:`
 * do `robots.txt` → JSON Feed anunciado na página → os caminhos conhecidos → página (artigo ou
 * lista, quando `selectors` for informado). Nunca `fetch` direto: tudo passa por
 * `crawlGet`/`checkRobots` (SSRF em `pipeline/net.ts`), no máximo `opts.maxRequests` requisições
 * reais (padrão 8, cada salto de redirecionamento contado), bucket `discover:<host>` a 20/h.
 * Candidato descoberto em HTML ou `robots.txt` (autodiscovery, `Sitemap:`) só é seguido quando é do
 * mesmo site da URL colada, em `http`/`https` e porta padrão — nunca aponta o robô para outro host.
 */
import { isIP } from "node:net";
import { parseHTML } from "linkedom";
import { err, ok, type Result } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { discoverFeed, isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet, type CrawlDeps } from "@/lib/pipeline/http";
import { isForbiddenAddress, isForbiddenHost, type ResolveHost } from "@/lib/pipeline/net";
import type { DocumentFormat, SourceKind } from "@/lib/pipeline/ports";
import { detectFormat, extractEntries, extractFromPage } from "@/lib/pipeline/steps/extract";
import type { RawEntry } from "@/lib/pipeline/types";
import { extractPageList } from "./page-list";
import { hostKey } from "./url";
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
  /** Um item por candidato tentado (ou descartado), na ordem, com o motivo em pt-BR. */
  tried: { url: string; outcome: string }[];
  robots: { allowed: boolean; crawlDelaySec: number | null };
  html: string | null;
  /** A URL colada, normalizada como string: base para checar "mesmo site" nos candidatos. */
  baseUrl: string;
}

const DEFAULT_MAX_REQUESTS = 8;
const DISCOVER_LIMIT_PER_HOUR = 20;
const SITE_NAME_MAX = 120;
const DESCRIPTION_MAX = 300;
/** Só nosso: nunca aparece numa mensagem real de `net.ts`, então dá para comparar por igualdade. */
const BUDGET_SENTINEL = "__citynews_discover_budget_exceeded__";

/** Ordem dos caminhos conhecidos quando não há autodiscovery nem `Sitemap:` no `robots.txt`. */
export const WELL_KNOWN_PATHS = [
  "/feed",
  "/rss",
  "/atom.xml",
  "/feed.json",
  "/sitemap-news.xml",
  "/news-sitemap.xml",
] as const;

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

/**
 * `link rel=alternate` de JSON Feed. `application/feed+json` sempre conta; `application/json`
 * só quando o `href` ou o `title` fala de feed — do contrário qualquer API JSON anunciada (o
 * `wp-json` do WordPress, por exemplo) seria confundida com um feed.
 */
function jsonFeedLinkFromHtml(html: string, baseUrl: string): string | null {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  for (const link of document.querySelectorAll("link[href]")) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (!rel.includes("alternate")) continue;
    const type = (link.getAttribute("type") ?? "").trim().toLowerCase();
    const href = link.getAttribute("href") ?? "";
    const title = (link.getAttribute("title") ?? "").toLowerCase();
    const looksLikeFeed = /feed/i.test(href) || /feed/i.test(title);
    if (type !== "application/feed+json" && !(type === "application/json" && looksLikeFeed)) {
      continue;
    }
    try {
      const url = new URL(href, baseUrl);
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

/**
 * `Crawl-delay` (RFC 9309, grupos): o grupo do nosso robô vence; na falta dele, o `*`. Várias
 * linhas `User-agent` seguidas (sem regra entre elas) formam um grupo só — mesma semântica de
 * `isAllowedByRobots` em `pipeline/crawl.ts`.
 */
export function crawlDelayFromRobots(robotsTxt: string | null, userAgent: string): number | null {
  if (!robotsTxt) return null;
  const token = (/^[A-Za-z0-9_-]+/.exec(userAgent.trim())?.[0] ?? "").toLowerCase();
  interface Group {
    agents: string[];
    delay: number | null;
  }
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const raw of robotsTxt.split(/\r\n|\r|\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], delay: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if (key === "crawl-delay" && current) {
      const n = Number(value);
      if (Number.isFinite(n)) current.delay = n;
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  // N4 (fix round 2): se o nosso grupo existe, a resposta é dele — mesmo sem `Crawl-delay` (`null`
  // nesse caso). Só cai para o `*` quando não existe grupo nosso nenhum.
  const mineGroup = groups.find((g) => g.agents.includes(token));
  if (mineGroup) return mineGroup.delay;
  const wildcard = groups.find((g) => g.agents.includes("*") && g.delay !== null);
  return wildcard ? wildcard.delay : null;
}

/**
 * Endereço proibido (achado 1): esquema errado, credenciais, host bloqueado por nome, ou DNS que
 * resolve para IP privado/reservado. Uma falha de DNS (fora do ar, não existe) **não** conta como
 * proibida — é só uma falha de rede comum, sem indício de má intenção.
 */
export async function isForbiddenTarget(url: URL, resolve: ResolveHost): Promise<boolean> {
  if (url.protocol !== "http:" && url.protocol !== "https:") return true;
  if (url.username || url.password) return true;
  if (isForbiddenHost(url.hostname)) return true;
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(bare) !== 0) return false; // IP literal público: já passou por `isForbiddenHost`.
  let addresses: string[];
  try {
    addresses = await resolve(url.hostname);
  } catch {
    return false;
  }
  if (addresses.length === 0) return false;
  return addresses.some(isForbiddenAddress);
}

/** Mesmo site da URL colada (mesmo registrável, ignorando `www.`), `http`/`https`, porta padrão. */
function sameSite(candidate: URL, base: URL): boolean {
  if (candidate.protocol !== "http:" && candidate.protocol !== "https:") return false;
  if (candidate.port !== "") return false;
  return hostKey(candidate) === hostKey(base);
}

type Attempt =
  | { kind: "feed"; strategy: ConsumptionStrategy; sourceKind: SourceKind; entries: RawEntry[] }
  | { kind: "html" }
  | { kind: "forbidden" }
  | { kind: "budget" }
  | { kind: "rate_limited" }
  | { kind: "miss"; network: boolean };

/**
 * Descoberta a partir da URL colada. Só falha com `forbidden_host`, `robots_disallowed`,
 * `robots_unavailable`, `rate_limited` ou `unreachable`; do contrário devolve o que encontrou, com
 * `tried` contando o caminho de cada candidato (inclusive os pulados).
 */
export async function discoverConsumption(
  deps: CrawlDeps,
  url: URL,
  opts?: { maxRequests?: number; selectors?: PageSelectors },
): Promise<Result<Discovery, DiscoverError>> {
  const maxRequests = opts?.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const target = url.toString();

  // Achado 1: antes de tocar em robots.txt, checa o próprio host (e o DNS) da URL colada.
  if (await isForbiddenTarget(url, deps.resolve)) return err("forbidden_host");

  let requestsUsed = 0;
  const tried: { url: string; outcome: string }[] = [];
  /**
   * Achado N2 (fix round 2): a régua de "mesmo site" vale para TODO salto, inclusive os de
   * redirecionamento dentro de uma única `crawlGet` — não só para o candidato inicial (que já passa
   * por `attemptSameSite`/`sameSite` antes de chegar aqui). Um `/feed` do próprio site que
   * redireciona para outro host ou outra porta é interrompido aqui mesmo, antes do pedido.
   */
  const onHop = (hop: URL): string | null => {
    if (!sameSite(hop, url)) return "outro domínio";
    if (requestsUsed >= maxRequests) return BUDGET_SENTINEL;
    requestsUsed++;
    return null;
  };
  const limits = {
    bucket: `discover:${url.hostname.toLowerCase()}`,
    limitPerHour: DISCOVER_LIMIT_PER_HOUR,
    onHop,
  };

  const robots = await checkRobots(deps, target, limits);
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable") return err("robots_unavailable");
  if (robots.kind === "disallowed") return err("robots_disallowed");
  const robotsTxt = robots.robotsTxt;

  const allowed = (candidate: string): boolean => {
    if (!robotsTxt) return true;
    const u = new URL(candidate);
    return isAllowedByRobots(robotsTxt, deps.userAgent, `${u.pathname}${u.search}`);
  };

  let home: { url: string; html: string } | null = null;
  let budgetNoted = false;
  /** Candidatos já requisitados: o mesmo caminho anunciado na página e na lista de caminhos conhecidos conta uma vez (FS-T9). */
  const attempted = new Set<string>();

  const attempt = async (candidate: string): Promise<Attempt> => {
    if (attempted.has(candidate)) return { kind: "miss", network: false };
    attempted.add(candidate);
    if (!allowed(candidate)) {
      tried.push({ url: candidate, outcome: "robots.txt não permite este caminho" });
      return { kind: "miss", network: false };
    }
    if (requestsUsed >= maxRequests) {
      tried.push({ url: candidate, outcome: "orçamento de requisições esgotado" });
      return { kind: "budget" };
    }
    const res = await crawlGet(deps, candidate, limits);
    switch (res.kind) {
      case "rate_limited":
        tried.push({ url: candidate, outcome: "limite de requisições por hora atingido" });
        return { kind: "rate_limited" };
      case "http_error":
        tried.push({ url: candidate, outcome: `HTTP ${res.status}` });
        return { kind: "miss", network: false };
      case "network_error": {
        if (res.message === BUDGET_SENTINEL) {
          tried.push({ url: candidate, outcome: "orçamento de requisições esgotado" });
          return { kind: "budget" };
        }
        if (res.blocked) {
          // N2: um salto de redirecionamento recusado por `onHop` chega aqui com a mensagem exata
          // que `onHop` devolveu ("outro domínio"); qualquer outro bloqueio de política usa o texto
          // genérico.
          tried.push({
            url: candidate,
            outcome: res.message === "outro domínio" ? "outro domínio" : "endereço não permitido",
          });
          return { kind: "forbidden" };
        }
        tried.push({ url: candidate, outcome: "não respondeu" });
        return { kind: "miss", network: true };
      }
      case "too_large":
        tried.push({ url: candidate, outcome: "documento grande demais" });
        return { kind: "miss", network: false };
      case "not_modified":
        tried.push({ url: candidate, outcome: "sem conteúdo novo" });
        return { kind: "miss", network: false };
      case "ok": {
        const format = detectFormat(res.body);
        if (!format) {
          tried.push({ url: candidate, outcome: "formato não reconhecido" });
          return { kind: "miss", network: false };
        }
        if (format === "html") {
          if (!home) home = { url: candidate, html: res.body };
          tried.push({ url: candidate, outcome: "página sem feed anunciado" });
          return { kind: "html" };
        }
        const mapped = strategyFor(format)!;
        const entries = extractEntries(res.body, format, candidate);
        if (entries.length === 0) {
          tried.push({ url: candidate, outcome: "nenhum item extraído" });
          return { kind: "miss", network: false };
        }
        tried.push({ url: candidate, outcome: "ok" });
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
    baseUrl: target,
  });

  const noteBudgetOnce = (candidateUrl: string): void => {
    if (budgetNoted) return;
    budgetNoted = true;
    tried.push({ url: candidateUrl, outcome: "orçamento de requisições esgotado" });
  };

  /** `null` se pulou (fora do site, URL inválida, orçamento esgotado); senão o de `attempt`. */
  const attemptSameSite = async (candidateUrl: string): Promise<Attempt | null> => {
    if (requestsUsed >= maxRequests) {
      noteBudgetOnce(candidateUrl);
      return null;
    }
    let parsed: URL;
    try {
      parsed = new URL(candidateUrl);
    } catch {
      tried.push({ url: candidateUrl, outcome: "URL inválida" });
      return null;
    }
    if (!sameSite(parsed, url)) {
      tried.push({ url: candidateUrl, outcome: "outro domínio" });
      return null;
    }
    return attempt(candidateUrl);
  };

  // 1. O próprio link colado, se já for feed (ou sitemap, ou página). Só este primeiro candidato
  // aborta a análise inteira com `forbidden_host` quando bloqueado (achado #5/N1, fix round 2): é o
  // link que a pessoa colou, então um bloqueio de política nele é o próprio veredito. Um candidato
  // secundário (autodiscovery, `Sitemap:`, JSON Feed, caminho conhecido) que seja bloqueado — por
  // exemplo um redirecionamento para outro host (N2) — só fica registrado em `tried`, e a
  // descoberta segue adiante para o próximo candidato.
  const first = await attempt(target);
  if (first.kind === "rate_limited") return err("rate_limited");
  if (first.kind === "forbidden") return err("forbidden_host");
  if (first.kind === "feed") return ok(finish(target, first));
  if (first.kind === "miss" && first.network && !home) return err("unreachable");

  const capturedHome = home as { url: string; html: string } | null;

  // 2. Autodiscovery na página (RSS/Atom/RDF, ou o `Sitemap:` que a própria página anuncia).
  if (capturedHome) {
    const found = discoverFeed(capturedHome.url, capturedHome.html);
    if (found) {
      const r = await attemptSameSite(found.url);
      if (r?.kind === "rate_limited") return err("rate_limited");
      if (r?.kind === "feed") return ok(finish(found.url, r));
    }
  }

  // 3. `Sitemap:` do robots.txt.
  const sitemapUrl = sitemapFromRobots(robotsTxt, target);
  if (sitemapUrl) {
    const r = await attemptSameSite(sitemapUrl);
    if (r?.kind === "rate_limited") return err("rate_limited");
    if (r?.kind === "feed") return ok(finish(sitemapUrl, r));
  }

  // 4. JSON Feed anunciado na página.
  if (capturedHome) {
    const jsonLink = jsonFeedLinkFromHtml(capturedHome.html, capturedHome.url);
    if (jsonLink) {
      const r = await attemptSameSite(jsonLink);
      if (r?.kind === "rate_limited") return err("rate_limited");
      if (r?.kind === "feed") return ok(finish(jsonLink, r));
    }
  }

  // 5. Caminhos conhecidos (sempre na mesma origem: não precisa checar site).
  const origin = new URL(target).origin;
  for (const path of WELL_KNOWN_PATHS) {
    const candidate = `${origin}${path}`;
    if (requestsUsed >= maxRequests) {
      noteBudgetOnce(candidate);
      break;
    }
    const r = await attempt(candidate);
    if (r.kind === "rate_limited") return err("rate_limited");
    if (r.kind === "feed") return ok(finish(candidate, r));
  }

  // 6. Página (artigo, ou lista quando `selectors` foi informado): reaproveita o HTML já baixado.
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
          baseUrl: target,
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
      baseUrl: target,
    });
  }

  return err("nothing_found");
}

/**
 * Nome e descrição do site (título, `og:site_name`, meta descrição) para a prévia. Texto externo
 * (achado 7): sempre por `sanitizeExternalText`, cortado no tamanho e descartado (`null`, não
 * relatado) se carregar um padrão de instrução.
 */
export function siteMeta(html: string): { siteName: string | null; description: string | null } {
  const { document } = parseHTML(html);
  const metaContent = (selector: string): string =>
    document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  const rawName =
    metaContent('meta[property="og:site_name"]') ||
    document.querySelector("title")?.textContent?.trim() ||
    "";
  const rawDescription =
    metaContent('meta[name="description"]') || metaContent('meta[property="og:description"]') || "";
  const name = sanitizeExternalText(rawName, SITE_NAME_MAX);
  const description = sanitizeExternalText(rawDescription, DESCRIPTION_MAX);
  return {
    siteName: name.text && !name.injection ? name.text : null,
    description: description.text && !description.injection ? description.text : null,
  };
}
