import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { err, ok } from "@/lib/result";
import { removeHiddenElements } from "@/lib/security/hidden";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import { isAllowedByRobots } from "../crawl";
import { checkRobots, crawlGet } from "../http";
import { parseFeedDate } from "../parse-date";
import type { EnrichmentPatch, SourceRecord } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { titleFromSlug } from "../sitemap";
import { excerptOf, TITLE_MAX } from "./extract";
import type { IngestDeps } from "./fetch";

/** Atraso entre duas páginas da mesma fonte (concorrência 1). */
export const ENRICH_DELAY_MS = 1000;
/** Só o começo da página: os metadados vivem no `<head>` e o corpo da matéria vem logo depois. */
export const ENRICH_HTML_BYTES = 1024 * 1024;
/** Teto do corpo guardado (`collected_items.source_text`), o mesmo do `callAgent` por item. */
export const SOURCE_TEXT_MAX = 6_000;
/** Trecho do feed abaixo disto é só a abertura: sem a flag, o `enrich` busca o corpo na página. */
export const SHORT_EXCERPT_CHARS = 600;
/** Novas tentativas depois da primeira (2): no total 3 tentativas, depois segue sem enriquecer. */
export const ENRICH_MAX_RETRIES = 2;
/** Item mais velho que isto não é enriquecido (primeira coleta de um sitemap com muito histórico). */
export const ENRICH_MAX_AGE_MS = 48 * 60 * 60_000;
/** Quanto tempo o `robots.txt` de uma fonte fica em memória. */
const ROBOTS_TTL_MS = 10 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

const HTML_ACCEPT = "text/html, application/xhtml+xml;q=0.9, */*;q=0.1";

/**
 * O item passa pelo `enrich`? `consumption.enrich === true` liga sempre e `false` desliga sempre.
 * Sem a flag, liga quando o feed trouxe só a abertura (menos de `SHORT_EXCERPT_CHARS`) ou nada:
 * uma frase de RSS não sustenta uma matéria, e o corpo da página é a base da redação.
 */
export function enrichEnabled(consumption: unknown, excerpt?: string | null): boolean {
  const flag =
    typeof consumption === "object" && consumption !== null && !Array.isArray(consumption)
      ? (consumption as Record<string, unknown>)["enrich"]
      : undefined;
  if (flag === true) return true;
  if (flag === false) return false;
  return (excerpt?.trim().length ?? 0) < SHORT_EXCERPT_CHARS;
}

/** Mesmo site: igual ao `baseUrl` da fonte, ignorando um `www.` na frente. */
function sameSite(url: string, baseUrl: string): boolean {
  try {
    const bare = (h: string) => h.toLowerCase().replace(/^www\./, "");
    return bare(new URL(url).hostname) === bare(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
}

/** Tira o nome do site do fim do título (`Título | Site`, `Título - Site`) quando é o da fonte. */
export function cleanOgTitle(title: string, siteName: string): string {
  const sep = /\s+[|\-–—·»]\s+/g;
  let cutAt = -1;
  for (const m of title.matchAll(sep)) cutAt = m.index;
  if (cutAt < 0) return title;
  const tail = title.slice(cutAt).replace(sep, "").trim();
  return tail.toLowerCase() === siteName.trim().toLowerCase()
    ? title.slice(0, cutAt).trim()
    : title;
}

export interface Enrichment {
  title: string | null;
  imageUrl: string | null;
  publishedAt: string | null;
  lead: string | null;
  /** Corpo da matéria (Readability, sem texto oculto), até `SOURCE_TEXT_MAX`: só material da IA. */
  body: string | null;
  /** Campos descartados por instrução embutida no texto (o texto externo é dado, nunca ordem). */
  rejected: ("title" | "lead" | "image" | "body")[];
}

const EMPTY: Enrichment = {
  title: null,
  imageUrl: null,
  publishedAt: null,
  lead: null,
  body: null,
  rejected: [],
};

/** Corta no último espaço antes do teto, para não deixar palavra pela metade. */
function capText(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > max * 0.8 ? space : max).trimEnd()}…`;
}

function httpUrl(raw: string, base: string): string | null {
  try {
    const u = new URL(raw.trim(), base);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Metadados da página (og:title, og:image, article:published_time, lead) a partir do HTML, que
 * pode estar cortado. Função pura; todo texto passa por `sanitizeExternalText` e o campo com
 * instrução embutida é descartado (`rejected`), nunca aplicado.
 */
export function parseEnrichment(html: string, pageUrl: string, siteName: string): Enrichment {
  if (!html.trim()) return { ...EMPTY, rejected: [] };
  let document: ReturnType<typeof parseHTML>["document"];
  try {
    ({ document } = parseHTML(html));
  } catch {
    return { ...EMPTY, rejected: [] };
  }
  const meta = (...selectors: string[]): string => {
    for (const s of selectors) {
      const v = document.querySelector(s)?.getAttribute("content")?.trim();
      if (v) return v;
    }
    return "";
  };
  const rejected: Enrichment["rejected"] = [];

  const rawTitle =
    meta('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
    (document.querySelector("title")?.textContent ?? "").trim();
  let title: string | null = null;
  if (rawTitle) {
    const s = sanitizeExternalText(rawTitle, TITLE_MAX);
    if (s.injection) rejected.push("title");
    else title = cleanOgTitle(s.text.replace(/\s*\n\s*/g, " "), siteName) || null;
  }

  const rawLead = meta('meta[property="og:description"]', 'meta[name="description"]');
  let lead: string | null = null;
  if (rawLead) {
    const s = sanitizeExternalText(rawLead);
    if (s.injection) rejected.push("lead");
    else lead = excerptOf(s.text);
  }

  const rawImage = meta(
    'meta[property="og:image"]',
    'meta[property="og:image:secure_url"]',
    'meta[name="twitter:image"]',
  );
  let imageUrl: string | null = null;
  if (rawImage) {
    const url = httpUrl(rawImage, pageUrl);
    const s = url ? sanitizeExternalText(url, 2000) : null;
    if (s?.injection) rejected.push("image");
    else if (s && s.text === url) imageUrl = url;
  }

  const rawDate = meta(
    'meta[property="article:published_time"]',
    'meta[itemprop="datePublished"]',
    'meta[name="date"]',
  );
  const publishedAt = rawDate ? parseFeedDate(rawDate.slice(0, 64)) : null;

  // Corpo por último: a Readability altera o documento. Texto oculto sai antes (regra 6).
  let body: string | null = null;
  try {
    removeHiddenElements(document);
    const article = new Readability(document).parse();
    const raw = (article?.textContent ?? "")
      .split(/\n\s*\n|\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .join("\n");
    if (raw) {
      const s = sanitizeExternalText(raw);
      if (s.injection) rejected.push("body");
      else if (s.text.trim()) body = capText(s.text.trim(), SOURCE_TEXT_MAX);
    }
  } catch {
    body = null;
  }

  return { title, imageUrl, publishedAt, lead, body, rejected };
}

export interface EnrichDeps extends IngestDeps {
  /** Espera (injetável nos testes). Padrão: `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
}

type PageOutcome =
  { kind: "page"; html: string } | { kind: "skip" } | { kind: "retry"; reason: string };

/**
 * Passo `enrich` (entre `normalize` e `dedupe`): para a fonte com `consumption.enrich === true`,
 * abre a página de cada item novo e completa título (quando veio do slug), imagem, data e lead.
 * Nunca bloqueia: sem a flag, fora do site da fonte, item velho, robots.txt, limite por hora,
 * resposta fora de HTML ou 4xx seguem direto para o `dedupe`; falha transitória (rede, 429, 5xx)
 * tenta de novo até `ENRICH_MAX_RETRIES` vezes e depois também segue. Uma página por vez e 1 s de
 * intervalo por fonte; `crawlGet` dá o SSRF seguro, o UA do projeto e o limite por hora; só o
 * começo do HTML (`ENRICH_HTML_BYTES`) é lido. A política de imagem da fonte continua valendo no
 * passo de mídia (a `imageUrl` é só candidata, igual à de qualquer feed).
 */
export function createEnrichStep(deps: EnrichDeps): StepHandler {
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const clock = deps.monotonic ?? (() => performance.now());
  /** Fila por fonte: concorrência 1. */
  const chains = new Map<string, Promise<unknown>>();
  const lastRequestAt = new Map<string, number>();
  const robotsCache = new Map<string, { txt: string | null; until: number }>();

  const exclusive = <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    const run = (chains.get(key) ?? Promise.resolve()).then(fn, fn);
    chains.set(
      key,
      run.catch(() => undefined),
    );
    return run;
  };

  /** Uma requisição respeitando o atraso desde a última da mesma fonte. */
  const paced = async <T>(slug: string, fn: () => Promise<T>): Promise<T> => {
    const last = lastRequestAt.get(slug);
    if (last !== undefined) {
      const wait = last + ENRICH_DELAY_MS - clock();
      if (wait > 0) await sleep(wait);
    }
    try {
      return await fn();
    } finally {
      lastRequestAt.set(slug, clock());
    }
  };

  async function fetchPage(
    source: SourceRecord,
    url: string,
    signal: AbortSignal | undefined,
  ): Promise<PageOutcome> {
    const limits = {
      bucket: `crawler:${source.slug}`,
      limitPerHour: source.rateLimitPerHour,
      signal,
    };
    const onHop = (u: URL) =>
      sameSite(u.toString(), source.baseUrl) ? null : `fora do site da fonte: ${u.hostname}`;
    const path = (() => {
      const u = new URL(url);
      return `${u.pathname}${u.search}`;
    })();

    let robots = robotsCache.get(source.slug);
    if (!robots || robots.until < clock()) {
      // robots.txt não é página: sem atraso, e em cache por fonte.
      const v = await checkRobots(deps, url, { ...limits, onHop });
      if (v.kind === "unavailable") return { kind: "retry", reason: v.reason };
      if (v.kind === "rate_limited") return { kind: "skip" };
      robots = { txt: v.robotsTxt, until: clock() + ROBOTS_TTL_MS };
      robotsCache.set(source.slug, robots);
    }
    if (robots.txt !== null && !isAllowedByRobots(robots.txt, deps.userAgent, path))
      return { kind: "skip" };

    const res = await paced(source.slug, () =>
      crawlGet(deps, url, {
        ...limits,
        accept: HTML_ACCEPT,
        prefixBytes: ENRICH_HTML_BYTES,
        onHop,
      }),
    );
    switch (res.kind) {
      case "ok":
        return res.contentType && !/html|xml/i.test(res.contentType)
          ? { kind: "skip" }
          : { kind: "page", html: res.body };
      case "http_error":
        return res.status === 429 || res.status >= 500
          ? { kind: "retry", reason: `HTTP ${res.status}` }
          : { kind: "skip" };
      case "network_error":
        return res.blocked ? { kind: "skip" } : { kind: "retry", reason: res.message };
      case "rate_limited":
      case "not_modified":
      case "too_large":
        return { kind: "skip" };
    }
  }

  return async (msg, ctx) => {
    const id = msg.itemRef.replace(/^item:/, "");
    const next = ok([nextMessage(msg, "dedupe", `item:${id}`)]);
    const item = await deps.repo.collectedForEnrich(id);
    if (!item) return err(stepError.notFound(`item ${id} não encontrado`));
    const source = await deps.repo.sourceById(item.sourceId);
    if (!source || !enrichEnabled(source.consumption, item.excerpt)) return next;

    const now = deps.now();
    if (item.publishedAt && Date.parse(item.publishedAt) < now.getTime() - ENRICH_MAX_AGE_MS)
      return next;
    if (!sameSite(item.canonicalUrl, source.baseUrl)) return next;

    const outcome = await exclusive(source.slug, () =>
      fetchPage(source, item.canonicalUrl, ctx?.signal),
    );
    if (outcome.kind === "skip") return next;
    if (outcome.kind === "retry") {
      // Prazo do drain: a mensagem volta à fila sem contar tentativa.
      if (ctx?.signal?.aborted) return err(stepError.transient("prazo do drain"));
      return msg.attempt <= ENRICH_MAX_RETRIES
        ? err(stepError.transient(`enriquecimento adiado: ${outcome.reason}`))
        : next;
    }

    const found = parseEnrichment(outcome.html, item.canonicalUrl, source.name);
    const patch: EnrichmentPatch = {};
    const slugTitle = sanitizeExternalText(
      titleFromSlug(item.canonicalUrl, TITLE_MAX) ?? "",
      TITLE_MAX,
    );
    // O título do site só substitui o que veio do slug; título de feed nunca é trocado.
    if (found.title && item.originalTitle.toLowerCase() === slugTitle.text.toLowerCase())
      patch.originalTitle = found.title;
    if (found.lead && !item.excerpt) patch.excerpt = found.lead;
    // Corpo da página: o material completo da redação, quando rende mais que o trecho do feed.
    if (found.body && found.body.length > (item.excerpt?.length ?? 0))
      patch.sourceText = found.body;
    if (found.imageUrl && !item.imageUrl) patch.imageUrl = found.imageUrl;
    if (found.publishedAt && Date.parse(found.publishedAt) <= now.getTime() + DAY_MS)
      patch.publishedAt = found.publishedAt;
    if (Object.keys(patch).length > 0) await deps.repo.applyEnrichment(id, patch);
    return next;
  };
}
