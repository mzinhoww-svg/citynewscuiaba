import type { AggregatedView, ArticleSummary, EventView, TopicView } from "@/lib/db/queries/types";

/** Resultado hidratado, pronto para o componente (sem banco). */
export type SearchHit =
  | { kind: "article"; score: number; item: ArticleSummary }
  | { kind: "aggregated"; score: number; item: AggregatedView }
  | { kind: "event"; score: number; item: EventView }
  | { kind: "topic"; score: number; item: TopicView };

export interface SearchGroup {
  /** Assunto que reúne 2+ itens do resultado. */
  topic?: TopicView;
  items: SearchHit[];
}

export interface SearchResult {
  query: string;
  groups: SearchGroup[];
  total: number;
  /** "Você quis dizer…" quando nada foi encontrado e há grafia parecida no acervo. */
  didYouMean: string | null;
  /** A consulta usou vetores (embedding) além do texto. */
  semantic: boolean;
}
