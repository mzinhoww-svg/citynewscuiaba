import type { ConfidenceLevel } from "@/lib/confidence";
import { CONFIDENCE_TEXT } from "@/content/pt-BR/portal";
import { cx } from "../cx";

export interface ConfidenceMeterProps {
  level: ConfidenceLevel;
  className?: string;
}

const FILLED: Record<ConfidenceLevel, number> = { alta: 3, média: 2, baixa: 1 };
const TONE: Record<ConfidenceLevel, string> = {
  alta: "text-service",
  média: "text-warn",
  baixa: "text-danger",
};

/**
 * Nível de confiança do conjunto de fontes (spec §6.3): três barras + "Confiança alta".
 *
 * ```tsx
 * <ConfidenceMeter level="média" />
 * ```
 * - As barras são decorativas; o texto diz o nível (nada depende só de cor).
 */
export function ConfidenceMeter({ level, className }: ConfidenceMeterProps) {
  const on = FILLED[level];
  return (
    <span className={cx("inline-flex items-center gap-2 type-meta text-strong", className)}>
      <span aria-hidden="true" className={cx("inline-flex items-end gap-0.5", TONE[level])}>
        {[1, 2, 3].map((n) => (
          <span
            key={n}
            data-bar={n <= on ? "on" : "off"}
            className={cx(
              "w-1 rounded-xs",
              n === 1 ? "h-1.5" : n === 2 ? "h-2.5" : "h-3.5",
              n <= on ? "bg-current" : "bg-line-section",
            )}
          />
        ))}
      </span>
      {CONFIDENCE_TEXT[level]}
    </span>
  );
}
