import { neighborhoodBySlug } from "@/content/pt-BR/neighborhoods";

/**
 * Filtros da editoria na URL (P02). Todo valor desconhecido é descartado e vira o padrão:
 * `?periodo=abc` nunca chega ao banco nem gera erro 500 (P1 Review Focus 3).
 */
export type SectionPeriod = "24h" | "7d" | "30d" | "all";
export type SectionOrder = "recent" | "relevance";
export type SectionOrigin = "all" | "original" | "normalized";

export interface SectionFilters {
  period: SectionPeriod;
  neighborhood?: string;
  order: SectionOrder;
  origin: SectionOrigin;
  /** Subeditoria (slug); a página confere se pertence à editoria. */
  sub?: string;
  page: number;
}

/** Última página alcançável por "Carregar mais" (12 × 20 = 240 matérias). */
export const MAX_SECTION_PAGE = 20;

export const SECTION_DEFAULTS: SectionFilters = {
  period: "7d",
  order: "recent",
  origin: "all",
  page: 1,
};

/** Valores da URL em pt-BR ↔ valores internos. */
const PERIOD_PARAM: Record<SectionPeriod, string> = {
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
  all: "tudo",
};
const ORDER_PARAM: Record<SectionOrder, string> = { recent: "recentes", relevance: "relevancia" };
const ORIGIN_PARAM: Record<SectionOrigin, string> = {
  all: "todas",
  original: "original",
  normalized: "normalizado",
};

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** `URLSearchParams` ou o objeto `searchParams` que o Next entrega à página. */
export type SearchParamsInput = URLSearchParams | Record<string, string | string[] | undefined>;

/** Primeiro valor de um parâmetro, venha de onde vier. */
export function firstParam(sp: SearchParamsInput, key: string): string | undefined {
  if (sp instanceof URLSearchParams) return sp.get(key) ?? undefined;
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

function fromParam<T extends string>(map: Record<T, string>, raw: string | undefined): T | null {
  if (raw === undefined) return null;
  const hit = (Object.keys(map) as T[]).find((k) => map[k] === raw);
  return hit ?? null;
}

/** Página inteira entre 1 e MAX_SECTION_PAGE; qualquer outra coisa vira 1. */
export function parsePage(raw: string | undefined, max = MAX_SECTION_PAGE): number {
  if (!raw || !/^\d+$/.test(raw)) return 1;
  const n = Number(raw);
  return n < 1 ? 1 : Math.min(n, max);
}

export function parseSectionFilters(sp: SearchParamsInput): SectionFilters {
  const out: SectionFilters = {
    period: fromParam(PERIOD_PARAM, firstParam(sp, "periodo")) ?? SECTION_DEFAULTS.period,
    order: fromParam(ORDER_PARAM, firstParam(sp, "ordem")) ?? SECTION_DEFAULTS.order,
    origin: fromParam(ORIGIN_PARAM, firstParam(sp, "origem")) ?? SECTION_DEFAULTS.origin,
    page: parsePage(firstParam(sp, "page")),
  };
  const bairro = neighborhoodBySlug(firstParam(sp, "bairro"));
  if (bairro) out.neighborhood = bairro.slug;
  const sub = firstParam(sp, "sub");
  if (sub && sub.length <= 64 && SLUG.test(sub)) out.sub = sub;
  return out;
}

/** Querystring com só o que difere do padrão, em ordem estável (links e canonical). */
export function serializeSectionFilters(f: SectionFilters): string {
  const q = new URLSearchParams();
  if (f.sub) q.set("sub", f.sub);
  if (f.period !== SECTION_DEFAULTS.period) q.set("periodo", PERIOD_PARAM[f.period]);
  if (f.neighborhood) q.set("bairro", f.neighborhood);
  if (f.origin !== SECTION_DEFAULTS.origin) q.set("origem", ORIGIN_PARAM[f.origin]);
  if (f.order !== SECTION_DEFAULTS.order) q.set("ordem", ORDER_PARAM[f.order]);
  if (f.page > 1) q.set("page", String(f.page));
  return q.toString();
}

/** Link da editoria com os filtros atuais e alterações pontuais. */
export function sectionFilterHref(
  slug: string,
  f: SectionFilters,
  change: Partial<SectionFilters> = {},
): string {
  const qs = serializeSectionFilters({ ...f, ...change });
  return qs ? `/${slug}?${qs}` : `/${slug}`;
}

/** Valores de URL para os controles do formulário de filtros. */
export const SECTION_PARAM_VALUES = {
  period: PERIOD_PARAM,
  order: ORDER_PARAM,
  origin: ORIGIN_PARAM,
} as const;

export type WidenStep =
  | { kind: "period"; filters: SectionFilters }
  | { kind: "neighborhood"; filters: SectionFilters }
  | { kind: "reset"; filters: SectionFilters };

/**
 * Próximo passo do estado vazio: amplia o período (7 d → 30 d → tudo), depois tira o bairro,
 * depois limpa os filtros. `null` quando já não há o que ampliar.
 */
export function widenSectionFilters(f: SectionFilters): WidenStep | null {
  const base = { ...f, page: 1 };
  if (f.period === "24h" || f.period === "7d") {
    return { kind: "period", filters: { ...base, period: "30d" } };
  }
  if (f.period === "30d") return { kind: "period", filters: { ...base, period: "all" } };
  if (f.neighborhood)
    return { kind: "neighborhood", filters: { ...base, neighborhood: undefined } };
  if (f.sub || f.origin !== "all" || f.order !== "recent") {
    return { kind: "reset", filters: { ...SECTION_DEFAULTS, period: "all" } };
  }
  return null;
}
