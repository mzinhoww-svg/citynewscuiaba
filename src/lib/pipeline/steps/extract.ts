import { Readability } from "@mozilla/readability";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { parseHTML } from "linkedom";
import { z } from "zod";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { err, ok } from "@/lib/result";
import { parseFeedDate } from "../parse-date";
import type { DocumentFormat, IngestRepo } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import type { RawEntry } from "../types";

export const MAX_ENTRIES = 200;
const TITLE_MAX = 300;
const EXCERPT_MAX = 600;
const AUTHOR_MAX = 200;

/** Formato pelo elemento raiz (ou JSON Feed). `null` para o que não sabemos ler. */
export function detectFormat(body: string): DocumentFormat | null {
  const head = body.replace(/^﻿/, "").trimStart().slice(0, 65_536);
  if (head.startsWith("{")) {
    try {
      const parsed: unknown = JSON.parse(body);
      return JsonFeedSchema.safeParse(parsed).success ? "jsonfeed" : null;
    } catch {
      return null;
    }
  }
  const root = /<(?![?!])([A-Za-z_][\w:.-]*)/.exec(head.replace(/<!--[\s\S]*?-->/g, ""))?.[1];
  switch (root?.toLowerCase()) {
    case "rss":
      return "rss";
    case "rdf:rdf":
      return "rdf";
    case "feed":
      return "atom";
    case "urlset":
      return "sitemap";
    case "html":
      return "html";
    default:
      return null;
  }
}

/** DOCTYPE com entidades é recusado: nada de expansão de entidades (XML bomb, XXE). */
export function hasEntityDeclaration(xml: string): boolean {
  return /<!ENTITY/i.test(xml);
}

// ---------------------------------------------------------------------------
// Leitura segura de nós do XML (sem `any`)
// ---------------------------------------------------------------------------
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const get = (node: unknown, key: string): unknown => (isObj(node) ? node[key] : undefined);
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined ? [] : [v]);
const first = (v: unknown): unknown => list(v)[0];

function text(node: unknown): string {
  if (typeof node === "string") return node;
  if (typeof node === "number" || typeof node === "boolean") return String(node);
  if (Array.isArray(node)) return text(node[0]);
  if (isObj(node)) return text(node["#text"]);
  return "";
}
const attr = (node: unknown, name: string): string => text(get(node, `@_${name}`));

function absolute(u: string, base?: string): string | null {
  if (!u.trim()) return null;
  try {
    const url = new URL(u.trim(), base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function excerptOf(s: string): string | null {
  const flat = s.replace(/\s*\n\s*/g, " ").trim();
  if (!flat) return null;
  if (flat.length <= EXCERPT_MAX) return flat;
  const cut = flat.slice(0, EXCERPT_MAX);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > EXCERPT_MAX * 0.6 ? space : EXCERPT_MAX).trimEnd()}…`;
}

interface Fields {
  title: string;
  link: string;
  date: string;
  /** Resumo e corpo como vieram (HTML ou texto): todos passam pela detecção de injeção. */
  bodies: string[];
  author: string;
  image: string;
}

/** Monta o item com todo texto sanitizado; sem título ou sem URL http(s), descarta. */
function toEntry(f: Fields, base?: string): RawEntry | null {
  const title = sanitizeExternalText(f.title, TITLE_MAX);
  const url = absolute(f.link, base);
  if (!title.text || !url) return null;
  const bodies = f.bodies.filter((b) => b.trim()).map((b) => sanitizeExternalText(b));
  const author = sanitizeExternalText(f.author, AUTHOR_MAX);
  const checks = [title, author, ...bodies];
  const matches = [...new Set(checks.flatMap((c) => c.matches))];
  return {
    title: title.text.replace(/\s*\n\s*/g, " "),
    url,
    publishedAt: f.date ? parseFeedDate(f.date) : null,
    excerpt: excerptOf(bodies[0]?.text ?? ""),
    author: author.text || null,
    imageUrl: absolute(f.image, base),
    injection: matches.length > 0,
    injectionMatches: matches,
  };
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: false,
});

function imageFromRss(item: unknown): string {
  for (const enc of list(get(item, "enclosure")))
    if (attr(enc, "type").startsWith("image/")) return attr(enc, "url");
  for (const media of list(get(item, "media:content"))) {
    const medium = attr(media, "medium");
    if (medium === "image" || attr(media, "type").startsWith("image/")) return attr(media, "url");
  }
  const thumb = first(get(item, "media:thumbnail"));
  return thumb ? attr(thumb, "url") : "";
}

function rssItem(item: unknown): Fields {
  const guid = get(item, "guid");
  const guidLink = attr(guid, "isPermaLink") === "false" ? "" : text(guid);
  const content = text(get(item, "content:encoded"));
  const description = text(get(item, "description"));
  return {
    title: text(get(item, "title")),
    link: text(get(item, "link")) || (/^https?:/i.test(guidLink) ? guidLink : ""),
    date: text(get(item, "pubDate")) || text(get(item, "dc:date")),
    bodies: content ? [content, description] : [description],
    author: text(get(item, "dc:creator")) || text(get(item, "author")),
    image: imageFromRss(item),
  };
}

function atomEntry(entry: unknown): Fields {
  const links = list(get(entry, "link"));
  const alternate =
    links.find((l) => ["", "alternate"].includes(attr(l, "rel"))) ??
    (links.length ? links[0] : undefined);
  const image = links.find(
    (l) => attr(l, "rel") === "enclosure" && attr(l, "type").startsWith("image/"),
  );
  const summary = text(get(entry, "summary"));
  const content = text(get(entry, "content"));
  return {
    title: text(get(entry, "title")),
    link: alternate ? attr(alternate, "href") : "",
    date: text(get(entry, "published")) || text(get(entry, "updated")),
    bodies: summary ? [summary, content] : [content],
    author: text(get(first(get(entry, "author")), "name")),
    image: image ? attr(image, "href") : "",
  };
}

function sitemapUrl(url: unknown): Fields {
  const news = get(url, "news:news");
  return {
    title: text(get(news, "news:title")),
    link: text(get(url, "loc")),
    date: text(get(news, "news:publication_date")) || text(get(url, "lastmod")),
    bodies: [],
    author: "",
    image: text(get(first(get(url, "image:image")), "image:loc")),
  };
}

/**
 * Itens de RSS 2.0, RSS 1.0 (RDF), Atom e sitemap de notícias. `baseUrl` resolve links relativos.
 * XML malformado, com entidades declaradas ou de formato desconhecido → lista vazia.
 */
export function extractFromFeed(xml: string, baseUrl?: string): RawEntry[] {
  if (hasEntityDeclaration(xml) || XMLValidator.validate(xml) !== true) return [];
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return [];
  }
  let fields: Fields[] = [];
  const rss = get(doc, "rss");
  const rdf = get(doc, "rdf:RDF");
  const feed = get(doc, "feed");
  const urlset = get(doc, "urlset");
  if (rss !== undefined) fields = list(get(get(rss, "channel"), "item")).map(rssItem);
  else if (rdf !== undefined) fields = list(get(rdf, "item")).map(rssItem);
  else if (feed !== undefined) fields = list(get(feed, "entry")).map(atomEntry);
  else if (urlset !== undefined) fields = list(get(urlset, "url")).map(sitemapUrl);
  return fields
    .slice(0, MAX_ENTRIES)
    .map((f) => toEntry(f, baseUrl))
    .filter((e): e is RawEntry => e !== null);
}

const JsonFeedSchema = z.object({
  items: z.array(
    z.object({
      title: z.string().optional(),
      url: z.string().optional(),
      external_url: z.string().optional(),
      date_published: z.string().optional(),
      date_modified: z.string().optional(),
      summary: z.string().optional(),
      content_text: z.string().optional(),
      content_html: z.string().optional(),
      image: z.string().optional(),
      banner_image: z.string().optional(),
      author: z.object({ name: z.string().optional() }).optional(),
      authors: z.array(z.object({ name: z.string().optional() })).optional(),
    }),
  ),
});

/** JSON Feed 1.x (fontes do tipo `api`). */
export function extractFromJsonFeed(json: string, baseUrl?: string): RawEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  const feed = JsonFeedSchema.safeParse(parsed);
  if (!feed.success) return [];
  return feed.data.items
    .slice(0, MAX_ENTRIES)
    .map((i) =>
      toEntry(
        {
          title: i.title ?? "",
          link: i.url ?? i.external_url ?? "",
          date: i.date_published ?? i.date_modified ?? "",
          bodies: [i.summary ?? "", i.content_text ?? "", i.content_html ?? ""].filter(Boolean),
          author: i.authors?.[0]?.name ?? i.author?.name ?? "",
          image: i.image ?? i.banner_image ?? "",
        },
        baseUrl,
      ),
    )
    .filter((e): e is RawEntry => e !== null);
}

/** Página (fontes do tipo `page`): um item pela Readability, com URL canônica e data dos metadados. */
export function extractFromPage(html: string, pageUrl: string): RawEntry[] {
  const { document } = parseHTML(html);
  const meta = (selector: string): string =>
    document.querySelector(selector)?.getAttribute("content")?.trim() ?? "";
  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
    meta('meta[property="og:url"]');
  const h1 = document.querySelector("h1")?.textContent ?? "";
  const date =
    meta('meta[property="article:published_time"]') ||
    meta('meta[name="date"]') ||
    document.querySelector("time[datetime]")?.getAttribute("datetime") ||
    "";
  const author = meta('meta[name="author"]');
  const image = meta('meta[property="og:image"]');
  const ogTitle = meta('meta[property="og:title"]');

  let article: {
    title?: string | null;
    textContent?: string | null;
    excerpt?: string | null;
  } | null = null;
  try {
    article = new Readability(document).parse();
  } catch {
    article = null;
  }
  const entry = toEntry(
    {
      title: h1 || ogTitle || article?.title || "",
      link: canonical || pageUrl,
      date,
      bodies: [article?.textContent ?? article?.excerpt ?? ""],
      author,
      image,
    },
    pageUrl,
  );
  return entry ? [entry] : [];
}

/** Lê o documento validado de acordo com o formato. */
export function extractEntries(body: string, format: DocumentFormat, url: string): RawEntry[] {
  switch (format) {
    case "jsonfeed":
      return extractFromJsonFeed(body, url);
    case "html":
      return extractFromPage(body, url);
    default:
      return extractFromFeed(body, url);
  }
}

/** Etapa 4: documento válido → itens (`raw_items.entries`), um `normalize` por item. */
export function createExtractStep(deps: { repo: IngestRepo }): StepHandler {
  return async (msg) => {
    const id = msg.itemRef.replace(/^raw:/, "");
    const raw = await deps.repo.rawItem(id);
    if (!raw) return err(stepError.notFound(`raw_item ${id} não encontrado`));
    const format = detectFormat(raw.payload.body);
    if (!format) return err(stepError.invalid("formato desconhecido"));
    const entries = extractEntries(raw.payload.body, format, raw.payload.url).slice(0, MAX_ENTRIES);
    await deps.repo.updateRawItem(id, { state: "extracted", entries });
    return ok(entries.map((_, i) => nextMessage(msg, "normalize", `raw:${id}#${i}`)));
  };
}
