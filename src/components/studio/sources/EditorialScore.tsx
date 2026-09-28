import { scoreText } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface EditorialScoreProps {
  /** Score editorial de 1 a 5 (D-F7). */
  score: number;
  className?: string;
}

/**
 * Score editorial da fonte: "4 de 5" em texto; as estrelas só reforçam e ficam fora da árvore de
 * acessibilidade.
 *
 * ```tsx
 * <EditorialScore score={4} />
 * ```
 */
export function EditorialScore({ score, className }: EditorialScoreProps) {
  const value = Math.min(5, Math.max(1, Math.round(score)));
  return (
    <span className={cx("inline-flex items-center gap-1.5", className)}>
      <span aria-hidden="true" className="inline-flex items-center text-strong">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} data-filled={n <= value ? "true" : "false"}>
            <Icon name="star" size={14} fill={n <= value ? "currentColor" : "none"} />
          </span>
        ))}
      </span>
      <span className="type-meta text-strong whitespace-nowrap">{scoreText(value)}</span>
    </span>
  );
}
