import { parseHTML } from "linkedom";

export type FeedKind = "rss" | "sitemap" | "page";

const FEED_TYPES = /^application\/(?:rss|atom|rdf)\+xml$/i;
const FEED_PATH = /(?:\/feed|\/rss|\.rss|\/rss\.xml|\/atom\.xml|\/feed\.xml)\/?$/i;
const SITEMAP_PATH = /(?:\/sitemap-news\.xml|\/news-sitemap\.xml|\/sitemap_news\.xml)$/i;

function resolve(base: string, href: string | null): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Descoberta do feed na página inicial da fonte: `link rel=alternate` (RSS, Atom, RDF), depois
 * `link rel=sitemap` e links para `/feed`, `/rss` ou `/sitemap-news.xml`. `null` se nada casar;
 * `activateSource` então tenta os caminhos conhecidos direto.
 */
export function discoverFeed(
  baseUrl: string,
  html: string,
): { kind: FeedKind; url: string } | null {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  const links = [...document.querySelectorAll("link[href]")];

  for (const link of links) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    const type = (link.getAttribute("type") ?? "").trim();
    if (rel.includes("alternate") && FEED_TYPES.test(type)) {
      const url = resolve(baseUrl, link.getAttribute("href"));
      if (url) return { kind: "rss", url };
    }
  }
  for (const link of links) {
    const rel = (link.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
    if (rel.includes("sitemap")) {
      const url = resolve(baseUrl, link.getAttribute("href"));
      if (url) return { kind: "sitemap", url };
    }
  }
  for (const a of document.querySelectorAll("a[href]")) {
    const url = resolve(baseUrl, a.getAttribute("href"));
    if (!url) continue;
    const path = new URL(url).pathname;
    if (FEED_PATH.test(path)) return { kind: "rss", url };
    if (SITEMAP_PATH.test(path)) return { kind: "sitemap", url };
  }
  return null;
}

/** Token do produto no user-agent, em minúsculas ("CityNewsBot/1.0 (+…)" → "citynewsbot"). */
export function crawlerToken(userAgent: string): string {
  return (/^[A-Za-z0-9_-]+/.exec(userAgent.trim())?.[0] ?? "").toLowerCase();
}

interface Rule {
  allow: boolean;
  pattern: string;
}
interface Group {
  agents: string[];
  rules: Rule[];
}

function parseRobots(txt: string): Group[] {
  const groups: Group[] = [];
  let current: Group | null = null;
  let lastWasAgent = false;
  for (const rawLine of txt.split(/\r\n|\r|\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const value = m[2]!.trim();
    if (key === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(crawlerToken(value) || value.toLowerCase());
      lastWasAgent = true;
    } else if ((key === "allow" || key === "disallow") && current) {
      if (value !== "") current.rules.push({ allow: key === "allow", pattern: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }
  return groups;
}

function patternRegex(pattern: string): RegExp {
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`);
}

/**
 * RFC 9309: o grupo do nosso robô (pelo token do user-agent) vence o `*`; a regra que casa com
 * o caminho mais longo decide e, no empate, Allow vence. Sem regra que case, permitido.
 * `path` inclui a query ("/busca?q=x").
 */
export function isAllowedByRobots(robotsTxt: string, userAgent: string, path: string): boolean {
  if (path === "/robots.txt") return true;
  const token = crawlerToken(userAgent);
  const groups = parseRobots(robotsTxt);
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && a === token));
  const chosen = mine.length > 0 ? mine : groups.filter((g) => g.agents.includes("*"));
  let best: Rule | null = null;
  for (const rule of chosen.flatMap((g) => g.rules)) {
    if (!patternRegex(rule.pattern).test(path)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow)
    )
      best = rule;
  }
  return best ? best.allow : true;
}
