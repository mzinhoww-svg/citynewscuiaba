/**
 * Saúde operacional da fonte (aba Coleta, spec §7/§8): disponibilidade de 30 dias, erro de 24 h e
 * frescor do último item, combinados num score de 0 a 100.
 */
export interface HealthInputs {
  ok30: number;
  failed30: number;
  ok24h: number;
  failed24h: number;
  hoursSinceNewItem: number | null;
  expectedGapHours: number;
}

function freshness(hoursSinceNewItem: number | null, expectedGapHours: number): number {
  if (hoursSinceNewItem === null) return 0;
  if (hoursSinceNewItem <= 2 * expectedGapHours) return 1;
  if (hoursSinceNewItem <= 4 * expectedGapHours) return 0.5;
  return 0;
}

/**
 * `round(100 · (0,5 · disponibilidade30 + 0,3 · (1 − erro24h) + 0,2 · frescor))`. Sem nenhuma
 * coleta nos últimos 30 dias, não há dado suficiente: `null` (`healthLabel` mostra "sem_dados").
 */
export function operationalScore(h: HealthInputs): number | null {
  const total30 = h.ok30 + h.failed30;
  if (total30 === 0) return null;

  const availability30 = h.ok30 / total30;
  const total24h = h.ok24h + h.failed24h;
  const errorRate24h = total24h > 0 ? h.failed24h / total24h : 0;
  const fresh = freshness(h.hoursSinceNewItem, h.expectedGapHours);

  const score = 100 * (0.5 * availability30 + 0.3 * (1 - errorRate24h) + 0.2 * fresh);
  return Math.round(score);
}

export type HealthLabel = "saudavel" | "atencao" | "critica" | "sem_dados";

export function healthLabel(score: number | null): HealthLabel {
  if (score === null) return "sem_dados";
  if (score >= 80) return "saudavel";
  if (score >= 50) return "atencao";
  return "critica";
}
