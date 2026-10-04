import { parseHTML } from "linkedom";
import { removeHiddenElements } from "@/lib/security/hidden";
import { tryCanonicalUrl } from "../canonical-url";
import { checkRobots, crawlGet, type CrawlDeps } from "../http";
import type { FrontSignalInput, FrontpageRepo, SourceRecord } from "../ports";

/**
 * Passo `frontpage` (HOT-T2, spec 2026-10-03-destaques-e-profundidade R9): a cada 20 min lê a
 * página inicial de cada fonte ativa com `consumption.frontpage = true` e grava em `front_signals`
 * a posição dos 3 primeiros links de matéria do topo. Nada da página é guardado além da URL, da
 * posição e da hora; o texto da fonte nunca sai daqui (regra 6). A pauta quente (`detectHot`,
 * HOT-T1) só conta sinais casados com um item coletado.
 */

/** Só o começo da home: o topo é o que interessa. */
export const FRONTPAGE_HTML_BYTES = 512 * 1024;
/** Quantos links de matéria do topo viram sinal (rank 1 a 3). */
export const FRONTPAGE_TAKE = 3;
/** Fontes lidas ao mesmo tempo (cada uma: robots.txt + home, 10 s cada no pior caso). */
export const FRONTPAGE_CONCURRENCY = 4;
/** Depois disto (a partir do início) nenhuma fonte nova começa; `maxDuration` da rota é 60 s. */
export const FRONTPAGE_BUDGET_MS = 35_000;

const HTML_ACCEPT = "text/html, application/xhtml+xml;q=0.9, */*;q=0.1";

/** A fonte participa? Só com `consumption.frontpage === true` (ausente ou outro valor = não). */
export function frontpageEnabled(consumption: unknown): boolean {
  return (
    typeof consumption === "object" &&
    consumption !== null &&
    !Array.isArray(consumption) &&
    (consumption as Record<string, unknown>)["frontpage"] === true
  );
}

const bareHost = (h: string) =>
  h
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");

/** Chave de comparação: URL canônica sem `www.` (a mesma matéria com e sem `www.` é uma só). */
function bareKey(canonical: string): string {
  const u = new URL(canonical);
  return `${bareHost(u.hostname)}${u.port ? `:${u.port}` : ""}${u.pathname}${u.search}`;
}

/** A mesma URL canônica com e sem `www.` (o item pode ter sido coletado de qualquer uma). */
function hostVariants(canonical: string): string[] {
  const u = new URL(canonical);
  const bare = bareHost(u.hostname);
  const rest = `${u.port ? `:${u.port}` : ""}${u.pathname === "/" ? "" : u.pathname}${u.search}`;
  return [`https://${bare}${rest}`, `https://www.${bare}${rest}`];
}

/** Contêineres que nunca trazem a manchete: menu, rodapé, barra lateral, busca. */
const EXCLUDED_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "form",
  "nav",
  "footer",
  "aside",
  "[role=navigation]",
  "[role=banner]",
  "[role=contentinfo]",
  "[role=menu]",
  "[role=menubar]",
  "[role=search]",
].join(", ");

/** Classe ou id de bloco de menu, migalhas, tags, redes sociais ou rodapé. */
const EXCLUDED_CLASS =
  /(?:^|[\s_-])(?:menu|navbar|nav|breadcrumbs?|tags?|tag-list|social|share|footer|rodape|cookies?)(?:[\s_-]|$)/i;

/** Segmentos de caminho que indicam página de lista, conta ou institucional, não matéria. */
const EXCLUDED_SEGMENTS = new Set([
  "tag",
  "tags",
  "categoria",
  "categorias",
  "category",
  "editoria",
  "editorias",
  "secao",
  "secoes",
  "section",
  "autor",
  "autores",
  "author",
  "page",
  "pagina",
  "busca",
  "search",
  "login",
  "entrar",
  "assine",
  "assinatura",
  "newsletter",
  "contato",
  "sobre",
  "expediente",
  "feed",
  "rss",
  "wp-admin",
  "wp-login.php",
]);

const FILE_EXT = /\.(?:jpe?g|png|gif|webp|svg|avif|pdf|xml|json|txt|mp[34]|zip)$/i;

/**
 * Parece link de matéria? O último segmento é um slug de pelo menos 3 palavras ou traz um número
 * de 4+ dígitos (id). Raiz, editoria de uma palavra (`/politica`, `/cidades/`), tags e páginas
 * institucionais ficam de fora.
 */
function looksLikeArticle(u: URL): boolean {
  const segments = u.pathname.split("/").filter(Boolean);
  if (segments.length === 0) return false;
  if (FILE_EXT.test(u.pathname)) return false;
  if (segments.some((s) => EXCLUDED_SEGMENTS.has(s.toLowerCase()))) return false;
  const last = decodeURIComponent(segments[segments.length - 1]!).replace(
    /\.(?:s?html?|php|aspx?|ghtml)$/i,
    "",
  );
  if (/\d{4,}/.test(last)) return true;
  return last.split(/[-_]+/).filter((w) => /\p{L}/u.test(w)).length >= 3;
}

interface NodeLike {
  parentElement: NodeLike | null;
  getAttribute(name: string): string | null;
  tagName?: string;
}

/** Algum ancestral (até a raiz de conteúdo, exclusive) é bloco de menu, tags etc.? */
function insideExcludedBlock(a: NodeLike, root: unknown): boolean {
  if (/(?:^|\s)tag(?:\s|$)/i.test(a.getAttribute("rel") ?? "")) return true;
  for (let el: NodeLike | null = a; el && el !== root; el = el.parentElement) {
    const marker = `${el.getAttribute("class") ?? ""} ${el.getAttribute("id") ?? ""}`;
    if (EXCLUDED_CLASS.test(marker)) return true;
    if (el.tagName?.toLowerCase() === "header" && !hasArticleAncestor(el, root)) return true;
  }
  return false;
}

function hasArticleAncestor(el: NodeLike, root: unknown): boolean {
  for (let p = el.parentElement; p && p !== root; p = p.parentElement)
    if (p.tagName?.toLowerCase() === "article") return true;
  return false;
}

/**
 * Links de matéria no topo da home: dentro de `main` (ou `[role=main]`, ou o corpo), na ordem do
 * documento, só do domínio da fonte (com ou sem `www.`), em URL canônica e sem repetidos. Ignora
 * menu, cabeçalho do site, rodapé, barra lateral, tags, texto oculto e links de editoria curtos ou
 * raiz de seção. Função pura; nenhum texto da página sai daqui.
 */
export function parseFrontTop(
  html: string,
  baseUrl: string,
  take = FRONTPAGE_TAKE,
): { url: string; rank: number }[] {
  if (!html.trim() || take <= 0) return [];
  let base: URL;
  try {
    base = new URL(baseUrl);
  } catch {
    return [];
  }
  let document: ReturnType<typeof parseHTML>["document"];
  try {
    ({ document } = parseHTML(html));
  } catch {
    return [];
  }
  removeHiddenElements(document);
  for (const el of [...document.querySelectorAll(EXCLUDED_SELECTOR)]) el.remove();

  // HTML sem `<html>` (fragmento): o linkedom deixa um `body` vazio e põe o conteúdo na raiz.
  const body = document.body?.querySelector("a[href]") ? document.body : document.documentElement;
  const root = document.querySelector("main") ?? document.querySelector("[role=main]") ?? body;
  if (!root) return [];

  const site = bareHost(base.hostname);
  const seen = new Set<string>();
  const out: { url: string; rank: number }[] = [];
  for (const a of [...root.querySelectorAll("a[href]")]) {
    const href = a.getAttribute("href") ?? "";
    if (!href || href.startsWith("#")) continue;
    let target: URL;
    try {
      target = new URL(href, base);
    } catch {
      continue;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") continue;
    if (bareHost(target.hostname) !== site) continue;
    if (!looksLikeArticle(target)) continue;
    if (insideExcludedBlock(a as unknown as NodeLike, root)) continue;
    const canonical = tryCanonicalUrl(target.toString());
    if (!canonical) continue;
    const key = bareKey(canonical);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: canonical, rank: out.length + 1 });
    if (out.length >= take) break;
  }
  return out;
}

export interface FrontpageDeps extends Omit<CrawlDeps, "repo"> {
  repo: FrontpageRepo;
  /** Prazo duro da rota (aborta requisições em andamento). */
  signal?: AbortSignal;
  /** Até quando (ms desde o início) uma fonte nova pode começar. Padrão `FRONTPAGE_BUDGET_MS`. */
  budgetMs?: number;
  /** Relógio monotônico em ms (injetável nos testes). */
  monotonic?: () => number;
  concurrency?: number;
}

export type FrontpageSkip =
  | "robots"
  | "robots_unavailable"
  | "rate_limited"
  | "http"
  | "network"
  | "not_html"
  | "deadline"
  | "error";

export interface FrontpageReport {
  status: "done";
  /** Fontes elegíveis (ativas, com `frontpage`). */
  sources: number;
  /** Homes lidas com sucesso. */
  read: number;
  signals: number;
  /** Sinais casados com item coletado. */
  matched: number;
  skipped: Partial<Record<FrontpageSkip, number>>;
}

type SourceOutcome = { kind: "read"; signals: number; matched: number } | { kind: FrontpageSkip };

const sameSite = (url: URL, baseUrl: string): boolean => {
  try {
    return bareHost(url.hostname) === bareHost(new URL(baseUrl).hostname);
  } catch {
    return false;
  }
};

async function readSource(deps: FrontpageDeps, source: SourceRecord): Promise<SourceOutcome> {
  const home = new URL("/", source.baseUrl).toString();
  const limits = {
    bucket: `crawler:${source.slug}`,
    limitPerHour: source.rateLimitPerHour,
    signal: deps.signal,
    onHop: (u: URL) =>
      sameSite(u, source.baseUrl) ? null : `fora do site da fonte: ${u.hostname}`,
  };
  const crawl: CrawlDeps = {
    repo: deps.repo,
    http: deps.http,
    resolve: deps.resolve,
    userAgent: deps.userAgent,
  };

  // O robots.txt decide sobre `/` (a home); 4xx = sem restrição, 5xx/rede = não ler agora.
  const robots = await checkRobots(crawl, home, limits);
  if (robots.kind === "rate_limited") return { kind: "rate_limited" };
  if (robots.kind === "unavailable") return { kind: "robots_unavailable" };
  if (robots.kind === "disallowed") return { kind: "robots" };

  const res = await crawlGet(crawl, home, {
    ...limits,
    accept: HTML_ACCEPT,
    prefixBytes: FRONTPAGE_HTML_BYTES,
  });
  switch (res.kind) {
    case "rate_limited":
      return { kind: "rate_limited" };
    case "http_error":
    case "not_modified":
      return { kind: "http" };
    case "network_error":
    case "too_large":
      return { kind: "network" };
    case "ok":
      break;
  }
  if (res.contentType && !/html|xml/i.test(res.contentType)) return { kind: "not_html" };

  const links = parseFrontTop(res.body, res.url || home);
  if (links.length === 0) return { kind: "read", signals: 0, matched: 0 };

  const items = await deps.repo.itemsByUrls(links.flatMap((l) => hostVariants(l.url)));
  const byKey = new Map(items.map((i) => [bareKey(i.canonicalUrl), i]));
  const signals: FrontSignalInput[] = links.map((l) => {
    const item = byKey.get(bareKey(l.url));
    return {
      sourceId: source.id,
      itemId: item?.id ?? null,
      topicId: item?.topicId ?? null,
      url: l.url,
      rank: l.rank,
    };
  });
  await deps.repo.record(signals);
  return {
    kind: "read",
    signals: signals.length,
    matched: signals.filter((s) => s.itemId !== null).length,
  };
}

/**
 * Um ciclo do passo `frontpage` (rota `/api/ingest/frontpage`, cron `ingest-frontpage`): por fonte
 * ativa com `consumption.frontpage = true`, robots.txt permitindo `/`, limite por hora da fonte
 * (bucket `crawler:<slug>`, o mesmo da coleta e do `enrich`), 1 GET da home até 512 KB com o UA
 * do projeto e redirecionamento só dentro do site. Casa cada URL canônica com `collected_items` e
 * grava `front_signals`. Nunca lança: robots, 429, limite, rede e erro de uma fonte só pulam aquela
 * fonte. Cada fonte é lida uma vez por ciclo e cada URL entra uma vez por fonte.
 */
export async function runFrontpage(deps: FrontpageDeps): Promise<FrontpageReport> {
  const clock = deps.monotonic ?? (() => performance.now());
  const start = clock();
  const budget = deps.budgetMs ?? FRONTPAGE_BUDGET_MS;

  const unique = new Map<string, SourceRecord>();
  for (const s of await deps.repo.frontpageSources())
    if (s.status === "active" && frontpageEnabled(s.consumption) && !unique.has(s.id))
      unique.set(s.id, s);
  const queue = [...unique.values()];

  const report: FrontpageReport = {
    status: "done",
    sources: queue.length,
    read: 0,
    signals: 0,
    matched: 0,
    skipped: {},
  };
  const skip = (k: FrontpageSkip) => {
    report.skipped[k] = (report.skipped[k] ?? 0) + 1;
  };

  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      if (clock() - start > budget || deps.signal?.aborted) {
        skip("deadline");
        continue;
      }
      let outcome: SourceOutcome;
      try {
        outcome = await readSource(deps, s);
      } catch (e) {
        console.error(`frontpage ${s.slug}:`, e instanceof Error ? e.message : e);
        outcome = { kind: "error" };
      }
      if (outcome.kind === "read") {
        report.read += 1;
        report.signals += outcome.signals;
        report.matched += outcome.matched;
      } else skip(outcome.kind);
    }
  };
  const n = Math.max(1, Math.min(deps.concurrency ?? FRONTPAGE_CONCURRENCY, queue.length));
  await Promise.all(Array.from({ length: n }, worker));
  return report;
}
