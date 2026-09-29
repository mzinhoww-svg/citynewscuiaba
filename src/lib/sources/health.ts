export interface HealthInput {
  ok30: number;
  failed30: number;
  ok24h: number;
  failed24h: number;
  hoursSinceNewItem: number | null;
  expectedGapHours: number;
}

/** Score 0-100: 50% disponibilidade (30 dias), 30% ausência de erro (24 h), 20% frescor. `null` sem coletas. */
export function operationalScore(h: HealthInput): number | null {
  const total30 = h.ok30 + h.failed30;
  if (total30 === 0) return null;
  const availability = h.ok30 / total30;
  const total24 = h.ok24h + h.failed24h;
  const errorRate = total24 === 0 ? 0 : h.failed24h / total24;
  const gap = h.expectedGapHours > 0 ? h.expectedGapHours : 1;
  const fresh =
    h.hoursSinceNewItem === null
      ? 0
      : h.hoursSinceNewItem <= 2 * gap
        ? 1
        : h.hoursSinceNewItem <= 4 * gap
          ? 0.5
          : 0;
  return Math.round(100 * (0.5 * availability + 0.3 * (1 - errorRate) + 0.2 * fresh));
}

export function healthLabel(
  score: number | null,
): "saudavel" | "atencao" | "critica" | "sem_dados" {
  if (score === null) return "sem_dados";
  if (score >= 80) return "saudavel";
  if (score >= 50) return "atencao";
  return "critica";
}
