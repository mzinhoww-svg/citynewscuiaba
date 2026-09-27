import { REASON_TEXT } from "@/content/pt-BR/recommendations";
import type { RankList, RankedSource, ReasonKey, SourceSignals } from "./types";

/**
 * Temas que revelam atributo protegido (CLAUDE.md §5 regra 7): nunca aparecem numa
 * justificativa, mesmo que o leitor acompanhe a editoria. Cai para um texto sem tema.
 */
const SENSITIVE_TOPIC =
  /sa[uú]de|doen[cç]|m[eé]dic|religi|igrej|f[eé]\b|orienta[cç][aã]o|sexual|lgbt|g[eê]nero|ra[cç]a|racial|[eé]tni|renda|sal[aá]ri|pobreza|partid|ideolog|defici[eê]nci|sindica|imigra/i;

/** Tema curto, sem atributo sensível: pode entrar em "Recomendado porque você acompanha {tema}". */
export function isSafeTopic(topic: string | undefined): topic is string {
  if (!topic) return false;
  const t = topic.trim();
  return t.length > 0 && t.length <= 40 && !SENSITIVE_TOPIC.test(t);
}

/** Localidades de "Fontes locais" (Cuiabá e Várzea Grande, Baixada Cuiabana). */
export const LOCAL_LOCALITIES: readonly string[] = ["cuiaba", "varzea-grande"];

/** Tendência a partir da qual "Em alta nesta semana" vence "popular" (percentil 80). */
export const TRENDING_MIN = 0.8;

/**
 * Razão de maior contribuição (tracking-plan §5), na ordem de desempate:
 * seguida > busca recente > editoria acompanhada > local > em alta > popular > diversidade.
 * Sinais do leitor só contam com Personalização; sem ela, "Recomendadas" são populares da região.
 */
export function reasonFor(
  s: SourceSignals,
  list: RankList,
  personalization: boolean,
  discovery: boolean,
): ReasonKey {
  if (discovery) return "diversity";
  if (s.followed) return "followed";
  if (list === "trending") return "trending";
  if (list === "new") return "new";
  if (list === "recommended" && !personalization) return "regional_popular";
  if (personalization) {
    if (s.matchesSearch) return "recent_search";
    if (s.matchesTopic) return "topic";
    if (s.recentVisit) return "recent_visit";
    if (s.individual > 0 && s.locality === "cuiaba") return "local_follow";
    if (s.individual > 0 && s.similar) return "similar";
  }
  if (s.locality === "cuiaba") return "local_popular";
  if (s.trend >= TRENDING_MIN) return "trending";
  return "regional_popular";
}

/** Texto fixo da justificativa (spec §7.4). Nunca usa "gostar"; tema sensível nunca aparece. */
export function explainRecommendation(r: RankedSource, ctx: { topic?: string }): string {
  if (r.reason === "topic")
    return isSafeTopic(ctx.topic) ? REASON_TEXT.topic(ctx.topic.trim()) : REASON_TEXT.similar;
  return REASON_TEXT[r.reason];
}
