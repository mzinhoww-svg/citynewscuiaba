import { SOURCE_TEXT } from "@/content/pt-BR/recommendations";
import { cx } from "../cx";

export interface RecommendationReasonProps {
  /** Texto fixo de `explainRecommendation` (spec §7.4). */
  text: string;
  className?: string;
}

/**
 * Justificativa de recomendação em Azul IA (DESIGN.md §6). Sempre um dos textos fixos da spec,
 * em linguagem probabilística; leitores de tela ouvem "Por que aparece aqui:" antes.
 *
 * ```tsx
 * <RecommendationReason text={explainRecommendation(ranked, {})} />
 * ```
 */
export function RecommendationReason({ text, className }: RecommendationReasonProps) {
  return (
    <p className={cx("type-meta text-ai", className)}>
      <span className="sr-only">{SOURCE_TEXT.reasonPrefix}</span>
      {text}
    </p>
  );
}
