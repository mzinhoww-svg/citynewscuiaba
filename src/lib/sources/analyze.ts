import type { CallAgent } from "@/lib/ai/call-agent";
import type { CrawlDeps } from "@/lib/pipeline/http";
import { err, ok, type Result } from "@/lib/result";
import { discoverConsumption, type DiscoverError } from "./discover";
import { parseHTML } from "linkedom";
import { extractPageList } from "./page-list";
import { buildPreview, siteMeta } from "./preview";
import { domOutline, profileSource, ruleSuggestions, type ProfileSuggestion } from "./profile";
import type { RuleSuggestions } from "./profile";
import type { ConsumptionStrategy, PageSelectors, SourcePreview } from "./types";
import { hostKey, normalizePastedUrl, type UrlError } from "./url";
import type { SourceKind } from "@/lib/pipeline/ports";

/** Análise de link do painel de fontes (FS-T6): descoberta + prévia + regras + IA opcional. */

/** Seletores da IA só ficam se extraírem pelo menos 3 itens da própria página. */
export const MIN_SELECTOR_ITEMS = 3;

export type AnalyzeError = UrlError | DiscoverError | "disabled";

export type AiStatus = "ok" | "disabled" | "unavailable" | "insufficient_data" | "skipped";

export interface DuplicateInfo {
  id: string;
  name: string;
  slug: string;
  archived: boolean;
}

/** Resultado da descoberta sem corpo de matéria nem HTML (pode ir ao navegador). */
export interface DiscoverySummary {
  strategy: ConsumptionStrategy;
  kind: SourceKind;
  finalUrl: string;
  feedUrl: string | null;
  tried: { url: string; outcome: string }[];
  robots: { allowed: boolean; crawlDelaySec: number | null };
}

export interface LinkAnalysisFresh {
  /** Endereço normalizado. */
  url: string;
  duplicate: null;
  discovery: DiscoverySummary;
  preview: SourcePreview;
  termsLinks: string[];
  rules: RuleSuggestions;
  ai: ProfileSuggestion | null;
  aiStatus: Exclude<AiStatus, "skipped">;
  /** Seletores sugeridos pela IA que extraíram >= 3 itens da página. */
  selectorsValidated: boolean;
  discoveryId: string | null;
}

/** Fonte já cadastrada (ativa ou arquivada): a tela oferece abrir ou restaurar, sem nova coleta. */
export interface LinkAnalysisDuplicate {
  url: string;
  duplicate: DuplicateInfo;
  discovery: null;
  preview: null;
  termsLinks: [];
  rules: null;
  ai: null;
  aiStatus: "skipped";
  selectorsValidated: false;
  discoveryId: null;
}

export type LinkAnalysis = LinkAnalysisFresh | LinkAnalysisDuplicate;

/** Linha de `source_discoveries` (só título, data e URL; nunca corpo). */
export interface DiscoveryRecord {
  inputUrl: string;
  finalUrl: string;
  preview: SourcePreview;
  suggestion: { rules: RuleSuggestions; ai: ProfileSuggestion | null; aiStatus: AiStatus };
  promptVersion: number | null;
}

export interface AnalyzeDeps {
  crawl: CrawlDeps;
  callAgent: CallAgent;
  /** `feature_flags.source_link_analysis`: desliga toda a análise. */
  linkAnalysisEnabled: () => Promise<boolean>;
  /** `feature_flags.ai_enabled`: desligada, a análise segue sem sugestões da IA. */
  aiEnabled: () => Promise<boolean>;
  /** Slugs das editorias aceitas. */
  sections: () => Promise<string[]>;
  /** Fonte já cadastrada no mesmo endereço (`hostKey`), ativa ou arquivada. */
  findDuplicate: (hostKey: string) => Promise<DuplicateInfo | null>;
  saveDiscovery: (record: DiscoveryRecord) => Promise<string | null>;
  promptVersion?: () => Promise<number | null>;
  now: () => Date;
}

const MAX_CANDIDATES = 20;

/**
 * Página de seção sem feed rende só 1 item na descoberta, pouco para a IA sugerir seletores. Para a
 * amostra do modelo (só título, link e data; nunca corpo), usa os links da própria página: mesmo
 * site, texto de 20 a 200 caracteres, sem repetir endereço. Não altera a prévia mostrada.
 */
export function pageLinkCandidates(html: string, pageUrl: string): SourcePreview["items"] {
  const out: SourcePreview["items"] = [];
  const seen = new Set<string>();
  let base: URL;
  try {
    base = new URL(pageUrl);
  } catch {
    return out;
  }
  try {
    const { document } = parseHTML(html);
    for (const a of Array.from(document.querySelectorAll("a[href]"))) {
      if (out.length >= MAX_CANDIDATES) break;
      const title = (a.textContent ?? "").replace(/\s+/g, " ").trim();
      if (title.length < 20 || title.length > 200) continue;
      let target: URL;
      try {
        target = new URL(a.getAttribute("href") ?? "", base);
      } catch {
        continue;
      }
      if (target.protocol !== "https:" && target.protocol !== "http:") continue;
      if (hostKey(target) !== hostKey(base)) continue;
      target.hash = "";
      const key = target.toString();
      if (seen.has(key) || key === base.toString()) continue;
      seen.add(key);
      out.push({ title, url: key, publishedAt: null });
    }
  } catch {
    return out;
  }
  return out;
}

const summary = (d: {
  strategy: ConsumptionStrategy;
  kind: SourceKind;
  finalUrl: string;
  feedUrl: string | null;
  tried: DiscoverySummary["tried"];
  robots: DiscoverySummary["robots"];
}): DiscoverySummary => ({
  strategy: d.strategy,
  kind: d.kind,
  finalUrl: d.finalUrl,
  feedUrl: d.feedUrl,
  tried: d.tried,
  robots: d.robots,
});

/**
 * Analisa um link colado: normaliza (SSRF), procura duplicata, descobre o consumo (feed, sitemap ou
 * página; no máximo 8 requisições, robots respeitado), monta a prévia (títulos, datas e links),
 * sugere por regra e, com a IA ligada, por `source_profiler`. A IA nunca sugere política, fonte única,
 * confiabilidade nem frequência. Grava `source_discoveries` sem corpo. Nunca lança por falha de rede.
 */
export async function analyzeLink(
  input: string,
  deps: AnalyzeDeps,
): Promise<Result<LinkAnalysis, AnalyzeError>> {
  if (!(await deps.linkAnalysisEnabled())) return err("disabled");
  const normalized = normalizePastedUrl(input);
  if (!normalized.ok) return err(normalized.error);
  const url = normalized.value;

  const duplicate = await deps.findDuplicate(hostKey(url));
  if (duplicate)
    return ok({
      url: url.toString(),
      duplicate,
      discovery: null,
      preview: null,
      termsLinks: [],
      rules: null,
      ai: null,
      aiStatus: "skipped",
      selectorsValidated: false,
      discoveryId: null,
    });

  const found = await discoverConsumption(deps.crawl, url);
  if (!found.ok) return err(found.error);
  let discovery = found.value;

  const meta = discovery.html ? siteMeta(discovery.html) : { siteName: null, description: null };
  let preview = buildPreview(discovery, meta);
  const rules = ruleSuggestions(preview, url, {
    crawlDelaySec: discovery.robots.crawlDelaySec,
    now: deps.now(),
  });

  let ai: ProfileSuggestion | null = null;
  let aiStatus: LinkAnalysisFresh["aiStatus"] = "disabled";
  let selectorsValidated = false;
  if (await deps.aiEnabled()) {
    const isPage = discovery.strategy === "page_article" || discovery.strategy === "page_list";
    const sample =
      isPage && discovery.html && preview.items.length < MIN_SELECTOR_ITEMS
        ? { ...preview, items: pageLinkCandidates(discovery.html, discovery.finalUrl) }
        : preview;
    const profiled = await profileSource(deps.callAgent, {
      preview: sample,
      domOutline: isPage && discovery.html ? domOutline(discovery.html) : null,
      sections: await deps.sections(),
    });
    if (profiled.ok) {
      ai = profiled.value;
      aiStatus = "ok";
    } else {
      aiStatus =
        profiled.error === "insufficient_data"
          ? "insufficient_data"
          : profiled.error === "disabled"
            ? "disabled"
            : "unavailable";
    }
  }

  // Seletores da IA só valem se extraírem >= 3 itens da própria página.
  const proposed: PageSelectors | null = ai?.pageSelectors.value ?? null;
  if (ai && proposed) {
    const entries = discovery.html
      ? extractPageList(discovery.html, discovery.finalUrl, proposed)
      : [];
    if (entries.length >= MIN_SELECTOR_ITEMS) {
      selectorsValidated = true;
      if (discovery.strategy === "page_article") {
        discovery = { ...discovery, strategy: "page_list", entries };
        preview = buildPreview(discovery, meta);
      }
    } else {
      ai = { ...ai, pageSelectors: { ...ai.pageSelectors, value: null } };
    }
  }

  const promptVersion = ai && deps.promptVersion ? await deps.promptVersion() : null;
  const discoveryId = await deps.saveDiscovery({
    inputUrl: url.toString(),
    finalUrl: discovery.finalUrl,
    preview,
    suggestion: { rules, ai, aiStatus },
    promptVersion,
  });

  return ok({
    url: url.toString(),
    duplicate: null,
    discovery: summary(discovery),
    preview,
    termsLinks: preview.termsLinks,
    rules,
    ai,
    aiStatus,
    selectorsValidated,
    discoveryId,
  });
}
