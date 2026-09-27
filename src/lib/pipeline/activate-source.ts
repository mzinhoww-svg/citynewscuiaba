import { err, ok, type Result } from "@/lib/result";
import { discoverFeed, isAllowedByRobots } from "./crawl";
import { checkRobots, crawlGet } from "./http";
import type { SourceKind } from "./ports";
import type { IngestDeps } from "./steps/fetch";
import { detectFormat, extractEntries } from "./steps/extract";

/** Caminhos tentados quando a página não anuncia o feed. */
export const WELL_KNOWN_FEEDS = [
  { kind: "rss", path: "/feed" },
  { kind: "rss", path: "/rss" },
  { kind: "sitemap", path: "/sitemap-news.xml" },
] as const;

export interface Activation {
  kind: SourceKind;
  feedUrl: string;
  entries: number;
}

const kindOf = (format: ReturnType<typeof detectFormat>): SourceKind | null => {
  switch (format) {
    case "rss":
    case "atom":
    case "rdf":
      return "rss";
    case "sitemap":
      return "sitemap";
    case "jsonfeed":
      return "api";
    case "html":
      return "page";
    default:
      return null;
  }
};

/**
 * Ativação de fonte (spec §9): fontes entram `paused` e só passam a `active` depois de descobrir
 * o feed, checar o `robots.txt` e testar a conexão (baixar e extrair ao menos um item).
 * Falha mantém o status e grava o motivo em `last_error`.
 */
export async function activateSource(
  slug: string,
  deps: IngestDeps,
): Promise<Result<Activation, string>> {
  const source = await deps.repo.sourceBySlug(slug);
  if (!source) return err(`fonte ${slug} não encontrada`);
  if (source.status === "blocked") return err("fonte bloqueada: não é ativada automaticamente");

  const fail = async (reason: string): Promise<Result<Activation, string>> => {
    await deps.repo.updateSource(source.id, { lastError: reason });
    return err(reason);
  };
  const limits = { bucket: `crawler:${source.slug}`, limitPerHour: source.rateLimitPerHour };

  const robots = await checkRobots(deps, source.baseUrl, limits);
  if (robots.kind === "unavailable") return fail(robots.reason);
  if (robots.kind === "rate_limited") return fail("limite de requisições por hora atingido");
  const robotsTxt = robots.robotsTxt;
  const allowed = (url: string): boolean => {
    if (!robotsTxt) return true;
    const u = new URL(url);
    return isAllowedByRobots(robotsTxt, deps.userAgent, `${u.pathname}${u.search}`);
  };

  /** Baixa, valida o formato e extrai: o `testConnection` da spec. */
  const testConnection = async (url: string): Promise<Result<Activation, string>> => {
    if (!allowed(url)) return err(`robots.txt bloqueia ${new URL(url).pathname}`);
    const res = await crawlGet(deps, url, limits);
    if (res.kind === "http_error") return err(`feed não respondeu: HTTP ${res.status} em ${url}`);
    if (res.kind === "network_error") return err(`feed não respondeu: ${res.message}`);
    if (res.kind === "rate_limited") return err("limite de requisições por hora atingido");
    if (res.kind !== "ok") return err(`resposta inesperada de ${url}`);
    const format = detectFormat(res.body);
    const kind = kindOf(format);
    if (!format || !kind || (kind === "page" && source.kind !== "page"))
      return err(`formato não reconhecido em ${url}`);
    const entries = extractEntries(res.body, format, url);
    if (entries.length === 0) return err(`nenhum item extraído de ${url}`);
    return ok({ kind, feedUrl: url, entries: entries.length });
  };

  const activate = async (a: Activation): Promise<Result<Activation, string>> => {
    await deps.repo.updateSource(source.id, {
      feedUrl: a.feedUrl,
      kind: a.kind,
      status: "active",
      lastError: null,
    });
    return ok(a);
  };

  // Feed já cadastrado (ou página, para fontes `page`): só testa.
  const configured = source.feedUrl ?? (source.kind === "page" ? source.baseUrl : null);
  if (configured) {
    const r = await testConnection(configured);
    return r.ok ? activate(r.value) : fail(r.error);
  }

  const candidates: string[] = [];
  const home = allowed(source.baseUrl)
    ? await crawlGet(deps, source.baseUrl, { ...limits, accept: "text/html" })
    : null;
  if (home?.kind === "ok") {
    const found = discoverFeed(home.url, home.body);
    if (found) candidates.push(found.url);
  }
  const origin = new URL(source.baseUrl).origin;
  for (const w of WELL_KNOWN_FEEDS) {
    const url = `${origin}${w.path}`;
    if (!candidates.includes(url)) candidates.push(url);
  }

  const reasons: string[] = [];
  for (const url of candidates) {
    const r = await testConnection(url);
    if (r.ok) return activate(r.value);
    reasons.push(r.error);
  }
  const blocked = reasons.find((r) => r.startsWith("robots.txt"));
  return fail(blocked ?? `nenhum feed encontrado (${reasons.join("; ")})`);
}
