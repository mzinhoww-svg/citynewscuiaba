/**
 * Sitemaps (architecture §8): índice em /sitemap.xml, notícias das últimas 48 h em
 * /sitemap-news.xml (Google News), assuntos em /sitemap-topics.xml e páginas em
 * /sitemap-pages.xml. Funções puras: recebem caminhos do próprio site e a URL base.
 * Itens agregados nunca entram: não têm página no CityNews.
 */
import { SITE } from "@/content/pt-BR/site";

export const NEWS_WINDOW_HOURS = 48;

export interface NewsEntry {
  path: string;
  title: string;
  publishedAt: string;
}

export interface UrlEntry {
  path: string;
  lastModified?: string;
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';

export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function iso(value: string): string | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const loc = (base: string, path: string) => xmlEscape(`${base}${path}`);

export function newsSitemapXml(entries: readonly NewsEntry[], now: Date, base: string): string {
  const since = now.getTime() - NEWS_WINDOW_HOURS * 3600_000;
  const urls = entries
    .map((e) => ({ ...e, at: iso(e.publishedAt) }))
    .filter((e): e is NewsEntry & { at: string } => {
      if (!e.at) return false;
      const t = new Date(e.at).getTime();
      return t >= since && t <= now.getTime() + 60_000;
    })
    .map(
      (e) =>
        `<url><loc>${loc(base, e.path)}</loc><news:news><news:publication><news:name>${xmlEscape(SITE.name)}</news:name><news:language>pt</news:language></news:publication><news:publication_date>${e.at}</news:publication_date><news:title>${xmlEscape(e.title)}</news:title></news:news></url>`,
    );
  return `${HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">${urls.join("")}</urlset>\n`;
}

export function urlsetXml(entries: readonly UrlEntry[], base: string): string {
  const urls = entries.map((e) => {
    const lm = e.lastModified ? iso(e.lastModified) : null;
    return `<url><loc>${loc(base, e.path)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}</url>`;
  });
  return `${HEAD}<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>\n`;
}

export function sitemapIndexXml(paths: readonly string[], base: string): string {
  const items = paths.map((p) => `<sitemap><loc>${loc(base, p)}</loc></sitemap>`);
  return `${HEAD}<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${items.join("")}</sitemapindex>\n`;
}

export function xmlResponse(xml: string, maxAge = 300): Response {
  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge}`,
    },
  });
}

/** Páginas fixas do portal (sem banco): home, hubs, editorias e institucionais. */
export const STATIC_PATHS: readonly string[] = [
  "/",
  "/explorar",
  "/fontes",
  "/panorama",
  "/newsletter",
  "/assuntos",
  "/agenda",
  "/agenda/sugerir",
  "/sobre",
  "/principios-editoriais",
  "/correcoes",
  "/direito-de-resposta",
  "/privacidade",
  "/termos",
  "/anuncie",
  "/contato",
];

export const SITEMAP_CHILDREN = [
  "/sitemap-news.xml",
  "/sitemap-articles.xml",
  "/sitemap-topics.xml",
  "/sitemap-pages.xml",
] as const;
