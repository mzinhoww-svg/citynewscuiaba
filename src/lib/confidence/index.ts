import { CONFIDENCE_REASONS as R } from "@/content/pt-BR/confidence";
import { round2 } from "@/lib/round";

export interface ConfidenceInput {
  independentSources: number;
  primarySources: number;
  centralConflict: boolean;
  hoursSinceUpdate: number;
}

export type ConfidenceLevel = "alta" | "média" | "baixa";

export interface Confidence {
  level: ConfidenceLevel;
  score: number;
  reasons: string[];
}

function freshness(hours: number): number {
  if (hours <= 6) return 1;
  if (hours <= 24) return 0.6;
  if (hours <= 72) return 0.3;
  return 0;
}

/**
 * Confiança de um tópico (spec §6.3). O nível segue as regras; o score segue a fórmula
 * e é comparado com a confiança mínima das regras de autonomia.
 */
export function computeConfidence(i: ConfidenceInput): Confidence {
  const indep = Math.max(0, i.independentSources);
  const primary = Math.max(0, i.primarySources);
  const hours = Math.max(0, i.hoursSinceUpdate);

  const score = round2(
    (0.3 * Math.min(indep, 3)) / 3 +
      0.3 * Math.min(primary, 1) +
      0.25 * (i.centralConflict ? 0 : 1) +
      0.15 * freshness(hours),
  );

  let level: ConfidenceLevel;
  if ((indep <= 1 && primary === 0) || i.centralConflict) level = "baixa";
  else if (indep >= 2 && primary >= 1 && hours <= 24) level = "alta";
  else level = "média";

  const reasons: string[] = [];
  if (indep === 0) reasons.push(R.noIndependent);
  else if (indep === 1) reasons.push(R.singleIndependent);
  if (primary === 0) reasons.push(R.noPrimary);
  if (i.centralConflict) reasons.push(R.centralConflict);
  if (hours > 24) reasons.push(R.stale);

  return { level, score, reasons };
}
