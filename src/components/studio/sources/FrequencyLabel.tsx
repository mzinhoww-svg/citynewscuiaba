import { clockTime, formatMinutes, FREQUENCY_TEXT } from "@/content/pt-BR/sources-admin";
import type { EffectiveFrequency } from "@/lib/sources";
import { cx } from "../../cx";

export interface FrequencyLabelProps {
  /** Frequência escolhida; `null` = segue o padrão global. */
  frequencyMinutes: number | null;
  /** Frequência efetiva (robots.txt e termos podem elevar a escolhida, spec §7.8.1). */
  effective: EffectiveFrequency;
  /** Próxima coleta prevista (ISO); ausente = não mostra a segunda linha. */
  nextCollectionAt?: string | null;
  className?: string;
}

/**
 * Frequência de coleta como a redação lê: "30 min · padrão", "10 min · via rápida",
 * "20 min · via rápida (robots)", "1 h 30", e "Próxima coleta 16:00" (fuso de Cuiabá).
 *
 * ```tsx
 * <FrequencyLabel frequencyMinutes={10} effective={{ minutes: 20, raisedBy: "robots" }} />
 * ```
 * - Via rápida = frequência escolhida abaixo de 30 min (ocupa vaga mesmo quando o robots.txt a
 *   devolve ao ciclo normal, §7.8.2).
 */
export function FrequencyLabel({
  frequencyMinutes,
  effective,
  nextCollectionAt,
  className,
}: FrequencyLabelProps) {
  const parts = [formatMinutes(effective.minutes)];
  if (frequencyMinutes === null) parts.push(FREQUENCY_TEXT.default);
  if (frequencyMinutes !== null && frequencyMinutes < 30) parts.push(FREQUENCY_TEXT.fast);
  const raised = effective.raisedBy ? ` (${FREQUENCY_TEXT.raisedBy[effective.raisedBy]})` : "";
  const main = `${parts.join(FREQUENCY_TEXT.separator)}${raised}`;
  if (nextCollectionAt === undefined)
    return <span className={cx("type-meta whitespace-nowrap", className)}>{main}</span>;
  return (
    <span className={cx("inline-flex flex-col gap-0.5", className)}>
      <span className="type-meta text-strong whitespace-nowrap">{main}</span>
      <span className="type-meta text-meta whitespace-nowrap">
        {nextCollectionAt
          ? FREQUENCY_TEXT.next(clockTime(nextCollectionAt))
          : FREQUENCY_TEXT.noNext}
      </span>
    </span>
  );
}
