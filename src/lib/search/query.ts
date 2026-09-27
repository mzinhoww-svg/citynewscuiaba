import { firstParam, type SearchParamsInput } from "@/lib/filters/section";

/**
 * Busca tradicional na URL (P12): `/busca?q=&tipo=&origem=&editoria=&periodo=&fonte=`.
 * Valor desconhecido é descartado e vira o padrão, então nada cru da URL chega ao banco.
 */
export type SearchType = "all" | "articles" | "topics" | "events" | "services" | "aggregated";
export type SearchOrigin = "all" | "citynews" | "others";
export type SearchPeriod = "all" | "24h" | "7d" | "30d";

export interface SearchFilters {
  q: string;
  type: SearchType;
  origin: SearchOrigin;
  period: SearchPeriod;
  /** Editoria (slug). */
  section?: string;
  /** Veículo (slug da fonte); só itens de outros veículos. */
  source?: string;
}

export const SEARCH_DEFAULTS: SearchFilters = { q: "", type: "all", origin: "all", period: "all" };

/** Tamanho máximo da consulta (caracteres). */
export const MAX_QUERY_LENGTH = 200;

const TYPE_PARAM: Record<SearchType, string> = {
  all: "tudo",
  articles: "materias",
  topics: "assuntos",
  events: "eventos",
  services: "servicos",
  aggregated: "outros",
};
const ORIGIN_PARAM: Record<SearchOrigin, string> = {
  all: "todas",
  citynews: "citynews",
  others: "outros",
};
const PERIOD_PARAM: Record<SearchPeriod, string> = {
  all: "tudo",
  "24h": "24h",
  "7d": "7d",
  "30d": "30d",
};

/** Valores de URL para os controles (abas, botões e selects). */
export const SEARCH_PARAM_VALUES = {
  type: TYPE_PARAM,
  origin: ORIGIN_PARAM,
  period: PERIOD_PARAM,
} as const;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fromParam<T extends string>(map: Record<T, string>, raw: string | undefined): T | null {
  if (raw === undefined) return null;
  return (Object.keys(map) as T[]).find((k) => map[k] === raw) ?? null;
}

function slugParam(raw: string | undefined): string | undefined {
  return raw && raw.length <= 64 && SLUG.test(raw) ? raw : undefined;
}

/** Espaços colapsados, sem caracteres de controle, no máximo 200 caracteres. */
export function normalizeQuery(raw: string | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH)
    .trim();
}

export function parseSearchParams(sp: SearchParamsInput): SearchFilters {
  const out: SearchFilters = {
    q: normalizeQuery(firstParam(sp, "q")),
    type: fromParam(TYPE_PARAM, firstParam(sp, "tipo")) ?? SEARCH_DEFAULTS.type,
    origin: fromParam(ORIGIN_PARAM, firstParam(sp, "origem")) ?? SEARCH_DEFAULTS.origin,
    period: fromParam(PERIOD_PARAM, firstParam(sp, "periodo")) ?? SEARCH_DEFAULTS.period,
  };
  const section = slugParam(firstParam(sp, "editoria"));
  if (section) out.section = section;
  const source = slugParam(firstParam(sp, "fonte"));
  if (source) out.source = source;
  return out;
}

/** Querystring só com o que difere do padrão, em ordem estável. */
export function serializeSearch(f: SearchFilters): string {
  const q = new URLSearchParams();
  if (f.q) q.set("q", f.q);
  if (f.type !== SEARCH_DEFAULTS.type) q.set("tipo", TYPE_PARAM[f.type]);
  if (f.origin !== SEARCH_DEFAULTS.origin) q.set("origem", ORIGIN_PARAM[f.origin]);
  if (f.section) q.set("editoria", f.section);
  if (f.period !== SEARCH_DEFAULTS.period) q.set("periodo", PERIOD_PARAM[f.period]);
  if (f.source) q.set("fonte", f.source);
  return q.toString();
}

/** Link da busca com os filtros atuais e alterações pontuais. */
export function searchHref(f: SearchFilters, change: Partial<SearchFilters> = {}): string {
  const qs = serializeSearch({ ...f, ...change });
  return qs ? `/busca?${qs}` : "/busca";
}

/** Palavras que não ajudam a achar nada (já sem acento). */
const STOPWORDS = new Set(
  (
    "a o as os e de da do das dos em no na nos nas um uma uns umas para pra por pelo pela pelos " +
    "pelas com sem que se ao aos ou mais mas muito como sobre entre ate sua seu suas seus isso " +
    "esta este essa esse e ja nao sim ha"
  ).split(" "),
);

/** Minúsculas e sem acento (comparação de termos). */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Termos da consulta para destaque: sem acento, sem palavras vazias, sem repetição. */
export function queryTerms(q: string): string[] {
  const words = fold(normalizeQuery(q)).match(/[\p{L}\p{N}]+/gu) ?? [];
  const seen = new Set<string>();
  for (const w of words) if (w.length >= 2 && !STOPWORDS.has(w)) seen.add(w);
  return [...seen];
}

/**
 * Palavras de pergunta e de pedido que não dizem o assunto ("o que aconteceu hoje?", "resuma",
 * "compare a cobertura"). Saem da consulta da busca com IA; o resto precisa aparecer nas fontes.
 */
const QUESTION_WORDS = new Set(
  (
    "que qual quais quando onde quem porque por que quanto quanta quantos quantas o a " +
    "aconteceu acontece acontecendo acontecer houve teve tem ha " +
    "hoje ontem agora recente recentemente ultimas ultimos novidades noticia noticias " +
    "resuma resumo resumir explique explica explicar diga conte fale mostre liste " +
    "compare comparar comparacao cobertura sobre sabe sabemos se ja ainda " +
    "me nos voce pode poderia gostaria quero saber favor"
  ).split(" "),
);

/**
 * Consulta da busca com IA: termos do assunto, sem palavras de pergunta (já sem acento). Trecho
 * entre colchetes é anotação (ex.: marcador de teste do provedor falso), não assunto.
 */
export function questionQuery(question: string): string {
  return queryTerms(question.replace(/\[[^\]]*\]/g, " "))
    .filter((t) => !QUESTION_WORDS.has(t))
    .join(" ");
}

/** Termos mínimos que uma fonte precisa ter: todos até 2; depois 60% (3 → 2, 4 → 3, 5 → 3). */
export function minMatchFor(termCount: number): number {
  return termCount <= 2 ? Math.max(1, termCount) : Math.ceil(termCount * 0.6);
}
