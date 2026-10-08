import { SOURCE_CATEGORY_TEXT } from "@/content/pt-BR/sources-list";
import { LOCALITY_TEXT } from "@/content/pt-BR/recommendations";
import type { AnonProfile } from "@/lib/anon/types";
import { explainRecommendation } from "@/lib/ranking/explain";
import { capItems, rankSources } from "@/lib/ranking/rank";
import {
  readerSignals,
  type ComputedSignals,
  type ReaderEvent,
  type TrendDirection,
} from "@/lib/ranking/signals";
import type { RankList, RankedSource, RecConfig } from "@/lib/ranking/types";

/**
 * Tela Fontes em destaque (P14, spec §7.5), sem React e sem banco: parâmetros da URL, perfil
 * local aplicado aos sinais do servidor, listas das 7 abas e dados dos cards.
 * O servidor rende a primeira versão (sem perfil local); o navegador refaz com o perfil.
 */

/** Fonte como a tela recebe do servidor (subconjunto serializável de `SourceEntry`). */
export type SourceListEntry = ComputedSignals & {
  name: string;
  href: string;
  categories: string[];
  itemsToday: number;
  lastUpdatedAt: string | null;
  /** Logotipo da fonte, ou ausente/`null` (monograma de reserva). */
  logoUrl?: string | null;
};

export const TAB_SLUGS: Record<RankList, string> = {
  popular: "mais-acessadas",
  trending: "em-alta",
  recommended: "recomendadas",
  followed: "seguidas",
  local: "locais",
  verified: "verificadas",
  new: "novas",
};
export const TAB_ORDER: readonly RankList[] = [
  "popular",
  "trending",
  "recommended",
  "followed",
  "local",
  "verified",
  "new",
];

export const PERIODS = ["hoje", "semana", "tendencia"] as const;
export const REGIONS = ["cuiaba", "mt", "nacional"] as const;
export const THEMES = ["cultura", "esportes", "economia", "servicos"] as const;
export type PeriodFilter = (typeof PERIODS)[number];
export type RegionFilter = (typeof REGIONS)[number];
export type ThemeFilter = (typeof THEMES)[number];

export interface SourcesQuery {
  tab: RankList;
  period: PeriodFilter;
  region?: RegionFilter;
  theme?: ThemeFilter;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

function pick<T extends string>(list: readonly T[], v: string | undefined): T | undefined {
  return list.find((x) => x === v);
}

/** Lê `?aba=`, `?periodo=`, `?regiao=` e `?tema=`; valores inválidos são ignorados. */
export function parseSourcesQuery(sp: Params): SourcesQuery {
  const slug = first(sp.aba);
  const tab = TAB_ORDER.find((t) => TAB_SLUGS[t] === slug) ?? "popular";
  const q: SourcesQuery = { tab, period: pick(PERIODS, first(sp.periodo)) ?? "semana" };
  const region = pick(REGIONS, first(sp.regiao));
  const theme = pick(THEMES, first(sp.tema));
  if (region) q.region = region;
  if (theme) q.theme = theme;
  return q;
}

/** URL da tela com mudanças (`null` tira o filtro). Padrões (Mais acessadas, semana) somem. */
export function sourcesHref(
  q: SourcesQuery,
  patch: {
    tab?: RankList;
    period?: PeriodFilter;
    region?: RegionFilter | null;
    theme?: ThemeFilter | null;
  } = {},
): string {
  const next = { ...q, ...patch };
  const p = new URLSearchParams();
  if (next.tab !== "popular") p.set("aba", TAB_SLUGS[next.tab]);
  if (next.period !== "semana") p.set("periodo", next.period);
  if (next.region) p.set("regiao", next.region);
  if (next.theme) p.set("tema", next.theme);
  const s = p.toString();
  return s ? `/fontes?${s}` : "/fontes";
}

/** O que o navegador sabe do leitor (perfil anônimo local, spec §5.3). */
export interface LocalReader {
  follows: string[];
  hidden: string[];
  history: AnonProfile["history"];
  searches: string[];
}

export function fromProfile(p: AnonProfile | null): LocalReader {
  if (!p) return { follows: [], hidden: [], history: [], searches: [] };
  return {
    follows: p.follows.filter((f) => f.kind === "source").map((f) => f.id),
    hidden: p.hidden.map((h) => h.sourceSlug),
    history: p.history,
    searches: p.searches,
  };
}

/**
 * Sem histórico (spec §11, critério 6; P14): personalização desligada, ou nenhuma leitura
 * guardada e nenhuma fonte seguida. A tela mostra populares, locais e a explicação.
 */
export function isNoHistory(r: LocalReader, personalization: boolean): boolean {
  if (!personalization) return true;
  return r.follows.length === 0 && r.history.length === 0;
}

/** Editorias lidas com leitura qualificada ao menos 2 vezes (base de "você acompanha"). */
function followedSections(history: LocalReader["history"]): Map<string, number> {
  const count = new Map<string, number>();
  for (const h of history) {
    if (!h.section) continue;
    if (!((h.seconds >= 30 && h.scrollPct >= 50) || h.seconds >= 60)) continue;
    count.set(h.section, (count.get(h.section) ?? 0) + 1);
  }
  for (const [k, v] of count) if (v < 2) count.delete(k);
  return count;
}

/**
 * Aplica o perfil local aos sinais do servidor. Seguidas valem sempre (escolha explícita);
 * histórico e buscas só com Personalização. Sem ela, `individual` e as afinidades ficam zeradas.
 */
export function personalizeEntries<T extends SourceListEntry>(
  entries: T[],
  reader: LocalReader,
  personalization: boolean,
  now: Date,
): T[] {
  const follows = new Set(reader.follows);
  const events: ReaderEvent[] = personalization
    ? reader.history.flatMap((h) =>
        h.sourceSlug
          ? [
              {
                name: "article_read" as const,
                sourceSlug: h.sourceSlug,
                at: h.at,
                seconds: h.seconds,
                scrollPct: h.scrollPct,
              },
            ]
          : [],
      )
    : [];
  const signals = readerSignals(entries, {
    reader: personalization ? events : undefined,
    followed: [...follows],
    now,
  });
  const sections = personalization ? followedSections(reader.history) : new Map<string, number>();
  const searches = personalization ? reader.searches.map((s) => s.toLowerCase()) : [];
  return entries.map((e, i) => {
    const s = signals[i]!;
    const hasEvents = events.length > 0;
    return {
      ...e,
      individual: personalization ? s.individual : 0,
      diversity: hasEvents ? s.diversity : e.diversity,
      followed: follows.has(e.slug) || s.followed,
      isNewForUser: hasEvents ? s.isNewForUser : !follows.has(e.slug),
      recentVisit: personalization && s.recentVisit,
      similar: personalization && s.similar,
      matchesTopic: personalization && e.categories.some((c) => sections.has(c)),
      matchesSearch:
        personalization &&
        searches.some(
          (q) => q.includes(e.name.toLowerCase()) || e.categories.some((c) => q.includes(c)),
        ),
    };
  });
}

/** Tema mais acompanhado (para "Recomendado porque você acompanha {tema}"). */
export function topicContext(reader: LocalReader, personalization: boolean): string | undefined {
  if (!personalization) return undefined;
  let best: [string, number] | undefined;
  for (const [k, v] of followedSections(reader.history)) if (!best || v > best[1]) best = [k, v];
  if (!best) return undefined;
  const name = SOURCE_CATEGORY_TEXT[best[0]];
  return name ? name.toLowerCase() : undefined;
}

export interface TabOptions {
  personalization: boolean;
  hidden: string[];
  config: RecConfig;
  limit: number;
  period?: PeriodFilter;
}

/** Uma lista da área Fontes, com teto, descoberta e justificativa (`rankSources`). */
export function buildTab(entries: SourceListEntry[], tab: RankList, o: TabOptions): RankedSource[] {
  // "Tendência" reordena Mais acessadas pela alta da semana.
  const list: RankList = tab === "popular" && o.period === "tendencia" ? "trending" : tab;
  return rankSources(entries, {
    list,
    limit: o.limit,
    cap: o.config.cap,
    discoveryEvery: o.config.discoveryEvery,
    hidden: o.hidden,
    weights: o.config.weights,
    personalization: o.personalization,
  });
}

/** Fonte parada: sem item novo há 3 h ou mais (P14, "Sem atualização há 3 h"). */
export const STALE_HOURS = 3;

export interface SourceCardView {
  slug: string;
  name: string;
  href: string;
  code: string;
  /** Logotipo da fonte; sem ele, o card usa o monograma `code`. */
  logo?: string;
  category: string;
  locality: string;
  reason: string;
  reach: number;
  trend: TrendDirection;
  itemsToday: number;
  updatedAt: string | null;
  stale: boolean;
  verified: boolean;
  preferred: boolean;
  followed: boolean;
  discovery: boolean;
}

/** Monograma de 2 letras (DESIGN.md §6): iniciais das palavras com mais de 2 letras. */
export function monogram(name: string): string {
  const words = name.split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]{2,}$/.test(w));
  const letters = (words.length >= 2 ? [words[0]![0], words[1]![0]] : [name[0], name[1]]).join("");
  return letters.toUpperCase();
}

export function toCardData(
  e: SourceListEntry,
  r: RankedSource,
  ctx: { topic?: string },
  now: Date,
): SourceCardView {
  const last = e.lastUpdatedAt ? Date.parse(e.lastUpdatedAt) : Number.NaN;
  return {
    slug: e.slug,
    name: e.name,
    href: e.href,
    code: monogram(e.name),
    ...(e.logoUrl ? { logo: e.logoUrl } : {}),
    category: SOURCE_CATEGORY_TEXT[e.categories[0] ?? ""] ?? SOURCE_CATEGORY_TEXT.cidade!,
    locality: LOCALITY_TEXT[e.locality] ?? e.locality,
    reason: explainRecommendation(r, ctx),
    reach: e.reach,
    trend: e.trendDirection,
    itemsToday: e.itemsToday,
    updatedAt: e.lastUpdatedAt,
    stale: Number.isNaN(last) || now.getTime() - last >= STALE_HOURS * 3_600_000,
    verified: e.verified,
    preferred: r.followed,
    followed: r.followed,
    discovery: r.discovery,
  };
}

/**
 * Itens recentes das fontes mais acessadas com teto por fonte (Review Focus 3): ordena pela
 * posição da fonte e, dentro dela, mantém a ordem recebida (mais recente primeiro).
 */
export function capPopularItems<T extends { sourceSlug: string }>(
  items: T[],
  rankedSlugs: string[],
  limit: number,
  cap: number,
): T[] {
  const pos = new Map(rankedSlugs.map((s, i) => [s, i]));
  const ordered = items
    .map((item, i) => ({ item, i, p: pos.get(item.sourceSlug) }))
    .filter((x): x is { item: T; i: number; p: number } => x.p !== undefined)
    .sort((a, b) => a.p - b.p || a.i - b.i)
    .map((x) => x.item);
  return capItems(ordered, limit, cap);
}
