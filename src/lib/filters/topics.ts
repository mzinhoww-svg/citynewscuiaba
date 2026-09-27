import type { TopicState } from "@/lib/db/queries/types";
import { firstParam, type SearchParamsInput } from "./section";

/** Filtros da lista de assuntos (P06) na URL: `situacao`, `semana`, `editoria`. */
export interface TopicListQuery {
  state?: TopicState;
  week: boolean;
  section?: string;
}

const STATE_PARAM: Record<TopicState, string> = {
  em_apuracao: "em-apuracao",
  confirmado: "confirmados",
  corrigido: "corrigidos",
  encerrado: "encerrados",
};
export const TOPIC_STATE_PARAM = STATE_PARAM;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function parseTopicListFilters(sp: SearchParamsInput): TopicListQuery {
  const out: TopicListQuery = { week: firstParam(sp, "semana") === "1" };
  const raw = firstParam(sp, "situacao");
  const state = (Object.keys(STATE_PARAM) as TopicState[]).find((k) => STATE_PARAM[k] === raw);
  if (state) out.state = state;
  const section = firstParam(sp, "editoria");
  if (section && section.length <= 64 && SLUG.test(section)) out.section = section;
  return out;
}

export function topicListHref(f: TopicListQuery, change: Partial<TopicListQuery> = {}): string {
  const next = { ...f, ...change };
  const q = new URLSearchParams();
  if (next.state) q.set("situacao", STATE_PARAM[next.state]);
  if (next.week) q.set("semana", "1");
  if (next.section) q.set("editoria", next.section);
  const qs = q.toString();
  return qs ? `/assuntos?${qs}` : "/assuntos";
}
