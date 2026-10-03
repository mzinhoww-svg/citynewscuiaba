export type TickerScope = "cuiaba" | "mt" | "brasil" | "mundo";

export interface TickerArticle {
  id: string;
  slug: string;
  title: string;
  publishedAt: string | null;
  status: string;
  /** Assunto (cluster): uma matéria por assunto no ticker. */
  topicId: string | null;
  newsScope: TickerScope;
}

export interface TickerItem {
  title: string;
  href: string;
  scope: TickerScope;
}

export interface PickOptions {
  now: Date;
  max?: number;
  windowHours?: number;
}

const RANK: Record<TickerScope, number> = { cuiaba: 0, mt: 1, brasil: 2, mundo: 3 };
const PUBLIC = new Set(["published", "updated"]);
const MIN_ITEMS = 5;
const HOUR = 3_600_000;

const isRegional = (s: TickerScope) => s === "cuiaba" || s === "mt";
const normTitle = (t: string) => t.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");

const CUIABA_RE = /cuiab[aá]|v[aá]rzea grande/i;
const MT_RE =
  /mato grosso|sinop|rondon[oó]polis|sorriso|lucas do rio verde|tangar[aá] da serra|barra do gar[cç]as|c[aá]ceres|primavera do leste|alta floresta|pantanal|chapada dos guimar[aã]es/i;
const MT_UF_RE = /\bMT\b/;
const CUIABA_SECTIONS = new Set(["cidade", "guia-cuiaba", "mobilidade", "clima"]);

/**
 * Escopo da matéria. Enquanto `articles.news_scope` não existe no banco, deriva de bairro,
 * editoria local e menção no título; quando existir, `newsScope` vence.
 */
export function scopeOf(a: {
  newsScope?: TickerScope | null;
  title: string;
  neighborhoods: readonly string[];
  sectionSlug: string;
}): TickerScope {
  if (a.newsScope) return a.newsScope;
  if (a.neighborhoods.length > 0 || CUIABA_SECTIONS.has(a.sectionSlug) || CUIABA_RE.test(a.title))
    return "cuiaba";
  if (MT_RE.test(a.title) || MT_UF_RE.test(a.title)) return "mt";
  return "brasil";
}

/**
 * Manchetes do ticker "Última hora": só publicadas, últimas 12 h (24 h se houver menos de 5),
 * regional primeiro e mais recente primeiro, um item por assunto, ao menos 2/3 regionais
 * quando houver. Não depende de a matéria estar em destaque.
 */
export function pickTickerItems(
  articles: readonly TickerArticle[],
  { now, max = 12, windowHours = 12 }: PickOptions,
): TickerItem[] {
  const ts = (a: TickerArticle) => Date.parse(a.publishedAt ?? "") || 0;
  const published = articles.filter(
    (a) => PUBLIC.has(a.status) && ts(a) > 0 && ts(a) <= now.getTime() + HOUR,
  );
  const within = (h: number) => published.filter((a) => now.getTime() - ts(a) <= h * HOUR);
  let pool = within(windowHours);
  if (pool.length < MIN_ITEMS) pool = within(Math.max(24, windowHours));

  const sorted = [...pool].sort((a, b) => RANK[a.newsScope] - RANK[b.newsScope] || ts(b) - ts(a));
  const topics = new Set<string>();
  const titles = new Set<string>();
  const unique = sorted.filter((a) => {
    const t = normTitle(a.title);
    if (!t || titles.has(t) || (a.topicId && topics.has(a.topicId))) return false;
    titles.add(t);
    if (a.topicId) topics.add(a.topicId);
    return true;
  });

  // Mistura final: regionais (já ordenados) até a cota de 2/3; o resto completa por escopo.
  const regional = unique.filter((a) => isRegional(a.newsScope));
  const other = unique.filter((a) => !isRegional(a.newsScope));
  const quota = Math.min(regional.length, Math.ceil((max * 2) / 3));
  const chosen = new Set([...regional.slice(0, quota), ...other.slice(0, max - quota)]);
  for (const a of unique) {
    if (chosen.size >= max) break;
    chosen.add(a);
  }
  return unique
    .filter((a) => chosen.has(a))
    .slice(0, max)
    .map((a) => ({ title: a.title.trim(), href: `/materia/${a.slug}`, scope: a.newsScope }));
}
