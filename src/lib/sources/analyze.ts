/**
 * Análise de um link colado (spec §7.1, O04a): normaliza, aponta duplicidade, descobre como
 * consumir (`discoverConsumption`), monta a prévia sem corpo, sugere por regra e, se `ai_enabled`,
 * pede ao `source_profiler` editorias, localidade, alertas e seletores de página. Seletores da IA
 * só ficam se `extractPageList` devolver ao menos 3 itens do mesmo site. Grava a descoberta em
 * `source_discoveries` só com títulos, datas e URLs (nunca corpo, nunca HTML).
 * Respeita `feature_flags.source_link_analysis` (desliga a análise em um clique).
 */
import { parseHTML } from "linkedom";
import { extractJsonLd } from "@/lib/agenda/extract/jsonld";
import type { SourceKind as ExtractKind } from "@/lib/agenda/types";
import { isAllowedByRobots } from "@/lib/pipeline/crawl";
import { checkRobots, crawlGet } from "@/lib/pipeline/http";
import { removeHiddenElements } from "@/lib/security/hidden";
import type { CallAgent } from "@/lib/ai/call-agent";
import type { CrawlDeps } from "@/lib/pipeline/http";
import type { SourceKind } from "@/lib/pipeline/ports";
import type { RawEntry } from "@/lib/pipeline/types";
import { err, ok, type Result } from "@/lib/result";
import { sanitizeExternalText } from "@/lib/security/sanitize";
import {
  discoverConsumption,
  isForbiddenTarget,
  siteMeta,
  type DiscoverError,
  type Discovery,
} from "./discover";
import { suggestFrequency } from "./frequency";
import { extractPageList } from "./page-list";
import { buildPreview } from "./preview";
import {
  domOutline,
  profileSource,
  ruleSuggestions,
  type ProfileSuggestion,
  type RuleSuggestions,
} from "./profile";
import type { ConsumptionStrategy, PageSelectors, SourcePreview } from "./types";
import { hostKey, normalizePastedUrl, type UrlProblem } from "./url";

export type AnalyzeError = UrlProblem | DiscoverError | "disabled";

export type AiStatus = "ok" | "disabled" | "unavailable" | "insufficient_data";

/** Fonte já cadastrada, para apontar duplicidade (inclusive arquivadas: "Restaurar?"). */
export interface ExistingSource {
  id: string;
  name: string;
  baseUrl: string;
  feedUrl: string | null;
  archived: boolean;
}

/** O que vai para `source_discoveries` (sem corpo, sem HTML). */
export interface DiscoveryRecord {
  inputUrl: string;
  finalUrl: string;
  preview: { title: string; url: string; publishedAt: string | null }[];
  suggestion: Record<string, unknown>;
  promptVersion: number | null;
}

export interface AnalyzeDeps {
  crawl: CrawlDeps;
  callAgent: CallAgent;
  isEnabled: (flag: "source_link_analysis" | "ai_enabled") => Promise<boolean>;
  existingSources: () => Promise<ExistingSource[]>;
  /** Editorias existentes (`sections.slug`): a IA só sugere entre estas. */
  sections: () => Promise<string[]>;
  saveDiscovery: (record: DiscoveryRecord) => Promise<string>;
  promptVersion?: () => Promise<number | null>;
  now: () => Date;
}

/** Resumo da descoberta que pode ir ao navegador: sem `entries` nem `html`. */
export interface DiscoverySummary {
  strategy: ConsumptionStrategy;
  kind: SourceKind;
  feedUrl: string | null;
  tried: { url: string; outcome: string }[];
  robots: { allowed: boolean; crawlDelaySec: number | null };
  baseUrl: string;
}

/** `sources.consumption` sugerido (spec §6.2), pronto para o cadastro. */
export interface SuggestedConsumption {
  strategy: ConsumptionStrategy;
  feedUrl: string | null;
  pageSelectors: PageSelectors | null;
  discovery: { at: string; by: "auto"; inputUrl: string; tried: number };
  robots: { checkedAt: string; allowed: boolean; crawlDelaySec: number | null };
  cadence: { itemsPerDay: number; medianGapMinutes: number | null; sampledAt: string };
}

/**
 * Fonte já cadastrada para o mesmo endereço: a análise para antes de tocar o host (achado 11 da
 * revisão FS-T6) e a tela oferece abrir (ou restaurar, se arquivada).
 */
export interface DuplicateFound {
  status: "duplicate";
  url: string;
  duplicate: { id: string; name: string; archived: boolean };
}

export type AnalyzeResult = DuplicateFound | LinkAnalysis;

export interface LinkAnalysis {
  status: "analyzed";
  url: string;
  duplicate: null;
  discovery: DiscoverySummary;
  preview: SourcePreview;
  termsLinks: string[];
  rules: RuleSuggestions;
  ai: ProfileSuggestion | null;
  aiStatus: AiStatus;
  selectorsValidated: boolean;
  consumption: SuggestedConsumption;
  discoveryId: string;
}

/** Seletores da IA só valem com ao menos isto de itens extraídos (spec §7.1.6, critério 5). */
const MIN_SELECTOR_ITEMS = 3;
const MAX_HEADLINES = 20;
const MIN_HEADLINE_CHARS = 12;
const HEADLINE_MAX = 200;

/** Aceita "vozdocoxipo.example" sem esquema: completa com https://. */
function withScheme(input: string): string {
  const s = input.trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`;
}

function pathKey(u: URL): string {
  return u.pathname.replace(/\/+$/, "") || "/";
}

/** Mesmo host (ignorando `www.`) e mesmo caminho do endereço base ou do feed de uma fonte. */
export function matchDuplicate(url: URL, list: ExistingSource[]): ExistingSource | null {
  const key = `${hostKey(url)}${pathKey(url)}`;
  for (const s of list) {
    for (const raw of [s.baseUrl, s.feedUrl]) {
      if (!raw) continue;
      let u: URL;
      try {
        u = new URL(raw);
      } catch {
        continue;
      }
      if (`${hostKey(u)}${pathKey(u)}` === key) return s;
    }
  }
  return null;
}

/**
 * Manchetes da página sem feed (só texto de link em título e URL do mesmo site): servem de
 * amostra para o modelo sugerir seletores. Nunca corpo — só o texto de `<a>` dentro de título
 * (ou título dentro de `<a>`), saneado.
 */
function headlineEntries(html: string, pageUrl: string): RawEntry[] {
  const { document } = parseHTML(html);
  removeHiddenElements(document);
  const base = new URL(pageUrl);
  const seen = new Set<string>();
  const out: RawEntry[] = [];
  for (const a of Array.from(document.querySelectorAll("a[href]"))) {
    if (out.length >= MAX_HEADLINES) break;
    const inHeading = a.closest("h1, h2, h3, h4") !== null;
    const hasHeading = a.querySelector("h1, h2, h3, h4") !== null;
    if (!inHeading && !hasHeading) continue;
    let url: URL;
    try {
      url = new URL(a.getAttribute("href") ?? "", pageUrl);
    } catch {
      continue;
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || hostKey(url) !== hostKey(base))
      continue;
    const s = sanitizeExternalText(a.textContent?.trim() ?? "", HEADLINE_MAX);
    if (s.text.length < MIN_HEADLINE_CHARS || seen.has(url.toString())) continue;
    seen.add(url.toString());
    out.push({
      title: s.text,
      url: url.toString(),
      publishedAt: null,
      excerpt: null,
      author: null,
      imageUrl: null,
      injection: s.injection,
      injectionMatches: s.matches,
    });
  }
  return out;
}

function summary(d: Discovery): DiscoverySummary {
  return {
    strategy: d.strategy,
    kind: d.kind,
    feedUrl: d.feedUrl,
    tried: d.tried,
    robots: d.robots,
    baseUrl: d.baseUrl,
  };
}

export async function analyzeLink(
  input: string,
  deps: AnalyzeDeps,
): Promise<Result<AnalyzeResult, AnalyzeError>> {
  if (!(await deps.isEnabled("source_link_analysis"))) return err("disabled");

  const normalized = normalizePastedUrl(withScheme(input));
  if (!normalized.ok) return normalized;
  const url = normalized.value;
  const now = deps.now();

  // Duplicidade antes de qualquer requisição: fonte já cadastrada não custa nada ao host.
  const duplicate = matchDuplicate(url, await deps.existingSources());
  if (duplicate)
    return ok({
      status: "duplicate",
      url: url.toString(),
      duplicate: { id: duplicate.id, name: duplicate.name, archived: duplicate.archived },
    });

  const found = await discoverConsumption(deps.crawl, url);
  if (!found.ok) return found;
  let discovery = found.value;

  const meta = discovery.html ? siteMeta(discovery.html) : { siteName: null, description: null };
  let preview = buildPreview(discovery, meta);

  // IA: só com a flag ligada; na página sem feed, a amostra são as manchetes e o esqueleto.
  let ai: ProfileSuggestion | null = null;
  let aiStatus: AiStatus = "disabled";
  let selectorsValidated = false;
  let pageSelectors: PageSelectors | null = null;
  const isPage = discovery.strategy === "page_article" && discovery.html !== null;

  if (await deps.isEnabled("ai_enabled")) {
    const aiPreview =
      isPage && discovery.html
        ? buildPreview(
            { ...discovery, entries: headlineEntries(discovery.html, discovery.baseUrl) },
            meta,
          )
        : preview;
    const profiled = await profileSource(deps.callAgent, {
      preview: aiPreview,
      domOutline: isPage && discovery.html ? domOutline(discovery.html) : null,
      sections: await deps.sections(),
    });
    if (profiled.ok) {
      ai = profiled.value;
      aiStatus = "ok";
      const sel = ai.pageSelectors.value;
      if (sel && isPage && discovery.html) {
        const items = extractPageList(discovery.html, discovery.baseUrl, sel);
        if (items.length >= MIN_SELECTOR_ITEMS) {
          selectorsValidated = true;
          pageSelectors = sel;
          discovery = {
            ...discovery,
            strategy: "page_list",
            kind: "page",
            feedUrl: discovery.baseUrl,
            entries: items,
          };
          preview = buildPreview(discovery, meta);
        }
      }
      if (!selectorsValidated && sel)
        ai = { ...ai, pageSelectors: { ...ai.pageSelectors, value: null } };
    } else {
      aiStatus =
        profiled.error === "insufficient_data"
          ? "insufficient_data"
          : profiled.error === "disabled"
            ? "disabled"
            : "unavailable";
    }
  }

  const rules = ruleSuggestions(preview, url, discovery.robots);
  const cadence = suggestFrequency(
    discovery.entries.map((e) => e.publishedAt).filter((d): d is string => d !== null),
    now,
  );
  // Frequência pela cadência observada (sempre ciclo normal: fonte nova nunca nasce rápida).
  if (cadence.basis === "cadence") rules.frequency = { value: cadence.minutes, origin: "regra" };

  const consumption: SuggestedConsumption = {
    strategy: discovery.strategy,
    feedUrl: discovery.feedUrl,
    pageSelectors,
    discovery: {
      at: now.toISOString(),
      by: "auto",
      inputUrl: input,
      tried: discovery.tried.length,
    },
    robots: {
      checkedAt: now.toISOString(),
      allowed: discovery.robots.allowed,
      crawlDelaySec: discovery.robots.crawlDelaySec,
    },
    cadence: {
      itemsPerDay: Math.round(cadence.itemsPerDay * 10) / 10,
      medianGapMinutes: cadence.medianGapMinutes,
      sampledAt: now.toISOString(),
    },
  };

  const discoveryId = await deps.saveDiscovery({
    inputUrl: input,
    finalUrl: preview.finalUrl,
    preview: preview.items.map((i) => ({ title: i.title, url: i.url, publishedAt: i.publishedAt })),
    suggestion: {
      strategy: discovery.strategy,
      feedUrl: discovery.feedUrl,
      tried: discovery.tried,
      robots: discovery.robots,
      droppedForInjection: preview.droppedForInjection,
      termsLinks: preview.termsLinks,
      rules,
      ai,
      aiStatus,
      selectorsValidated,
      // Robots e cadência lidos pelo servidor: o cadastro usa estes, nunca os do formulário.
      consumption,
    },
    promptVersion: ai && deps.promptVersion ? await deps.promptVersion() : null,
  });

  return ok({
    status: "analyzed",
    url: url.toString(),
    duplicate: null,
    discovery: summary(discovery),
    preview,
    termsLinks: preview.termsLinks,
    rules,
    ai,
    aiStatus,
    selectorsValidated,
    consumption,
    discoveryId,
  });
}

// ---------------------------------------------------------------------------
// Fonte de eventos (AGM-T6, spec 2026-10-08 §5.1)
// ---------------------------------------------------------------------------

export interface EventAnalyzeDeps {
  crawl: CrawlDeps;
  isEnabled: (flag: "source_link_analysis") => Promise<boolean>;
  existingSources: () => Promise<ExistingSource[]>;
}

export interface EventLinkAnalysis {
  status: "analyzed";
  url: string;
  /** Como o coletor lê os eventos: a primeira forma estruturada encontrada, senão `ai_page`. */
  extractKind: ExtractKind;
  /** Endereço que o coletor busca (`sources.base_url`): a API Tribe ou a própria página. */
  collectUrl: string;
  /** Nome sugerido (nome do site ou título da página, saneado). */
  name: string | null;
  tried: { url: string; outcome: string }[];
}

export type EventAnalyzeResult = DuplicateFound | EventLinkAnalysis;

const EVENT_ANALYZE_LIMIT_PER_HOUR = 20;
const TRIBE_PATH = "/wp-json/tribe/events/v1/events";
const EVENT_PAGE_ACCEPT =
  "text/html, application/xhtml+xml;q=0.9, text/calendar;q=0.8, application/rss+xml;q=0.8, application/xml;q=0.7, */*;q=0.1";

/** O corpo é JSON da API Tribe (`events` como lista)? */
function isTribeBody(body: string): boolean {
  try {
    const parsed = JSON.parse(body) as { events?: unknown };
    return Array.isArray(parsed.events);
  } catch {
    return false;
  }
}

/** Forma do conteúdo da página: iCal, RSS/Atom, JSON-LD com evento ou nada estruturado. */
function structuredKind(body: string): ExtractKind | null {
  const head = body.trimStart().slice(0, 500);
  if (/^BEGIN:VCALENDAR/i.test(head)) return "ical";
  if (/^(<\?xml[^>]*>\s*)?<(rss|feed|rdf:RDF)\b/i.test(head)) return "rss";
  if (/<html|<!doctype html/i.test(head) && extractJsonLd(body).length > 0) return "jsonld";
  return null;
}

/**
 * Análise do link de uma fonte de eventos: duplicidade sem requisição, robots.txt, depois tenta a
 * API Tribe (`{origem}/wp-json/tribe/events/v1/events?per_page=1` com `events[]`), e na página
 * colada iCal, RSS e JSON-LD de evento; sem nada estruturado, sugere `ai_page`. Não chama o
 * modelo: a leitura com IA só acontece na prévia do teste de conexão.
 */
export async function analyzeEventLink(
  input: string,
  deps: EventAnalyzeDeps,
): Promise<Result<EventAnalyzeResult, AnalyzeError>> {
  if (!(await deps.isEnabled("source_link_analysis"))) return err("disabled");
  const normalized = normalizePastedUrl(withScheme(input));
  if (!normalized.ok) return normalized;
  const url = normalized.value;

  const duplicate = matchDuplicate(url, await deps.existingSources());
  if (duplicate)
    return ok({
      status: "duplicate",
      url: url.toString(),
      duplicate: { id: duplicate.id, name: duplicate.name, archived: duplicate.archived },
    });

  if (await isForbiddenTarget(url, deps.crawl.resolve)) return err("forbidden_host");
  const limits = {
    bucket: `discover:${url.hostname.toLowerCase()}`,
    limitPerHour: EVENT_ANALYZE_LIMIT_PER_HOUR,
  };
  const robots = await checkRobots(deps.crawl, url.toString(), limits);
  if (robots.kind === "rate_limited") return err("rate_limited");
  if (robots.kind === "unavailable") return err("robots_unavailable");
  if (robots.kind === "disallowed") return err("robots_disallowed");
  const allowed = (u: URL) =>
    !robots.robotsTxt ||
    isAllowedByRobots(robots.robotsTxt, deps.crawl.userAgent, `${u.pathname}${u.search}`);

  const tried: { url: string; outcome: string }[] = [];
  const tribe = new URL(TRIBE_PATH, url.origin);
  const probe = new URL(tribe);
  probe.searchParams.set("per_page", "1");
  if (!allowed(probe)) tried.push({ url: probe.toString(), outcome: "robots.txt não permite" });
  else {
    const res = await crawlGet(deps.crawl, probe.toString(), {
      ...limits,
      accept: "application/json",
    });
    if (res.kind === "rate_limited") return err("rate_limited");
    if (res.kind === "ok" && isTribeBody(res.body)) {
      tried.push({ url: probe.toString(), outcome: "ok" });
      return ok({
        status: "analyzed",
        url: url.toString(),
        extractKind: "tribe",
        collectUrl: tribe.toString(),
        name: null,
        tried,
      });
    }
    tried.push({
      url: probe.toString(),
      outcome: res.kind === "ok" ? "sem API de eventos" : res.kind,
    });
  }

  const page = await crawlGet(deps.crawl, url.toString(), { ...limits, accept: EVENT_PAGE_ACCEPT });
  if (page.kind === "rate_limited") return err("rate_limited");
  if (page.kind !== "ok") return err("unreachable");
  const kind = structuredKind(page.body);
  tried.push({ url: url.toString(), outcome: kind ?? "sem dados estruturados de evento" });
  const isHtml = /<html|<!doctype html/i.test(page.body.trimStart().slice(0, 500));
  return ok({
    status: "analyzed",
    url: url.toString(),
    extractKind: kind ?? "ai_page",
    collectUrl: url.toString(),
    name: isHtml ? siteMeta(page.body).siteName : null,
    tried,
  });
}
