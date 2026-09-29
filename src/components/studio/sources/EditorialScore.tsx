import { EDITORIAL_SCORE_TEXT } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";

export interface EditorialScoreProps {
  /** 1 a 5. */
  score: number;
  className?: string;
}

/** Relevância editorial da fonte: "4 de 5" em texto; as estrelas são decoração (`aria-hidden`). */
export function EditorialScore({ score, className }: EditorialScoreProps) {
  const n = Math.min(5, Math.max(1, Math.round(score)));
  return (
    <span className={cx("inline-flex items-center gap-2 type-meta text-strong", className)}>
      <span aria-hidden="true" className="text-warn tracking-tight">
        {"★".repeat(n)}
        <span className="text-placeholder">{"★".repeat(5 - n)}</span>
      </span>
      <span>{EDITORIAL_SCORE_TEXT(n)}</span>
    </span>
  );
}
