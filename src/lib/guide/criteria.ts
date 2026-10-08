import { MIN_RATING_COUNT } from "./auto-publish";
import { normalizeWeights, type Weights } from "./score";
import type { GuideTemplate } from "./types";

/**
 * "Como escolhemos" (spec R2): texto curto e em linguagem simples, montado dos sinais que a lista
 * realmente usou. Nada de vocabulário de automação na tela pública (R3). O editor pode ajustar
 * antes de publicar; lista sem este texto nunca publica.
 */

type Signal = keyof Weights;
const ORDER: Signal[] = ["rating", "rank", "mentions", "completeness"];

const PHRASE: Record<Signal, string> = {
  rating: "nota dos clientes e número de avaliações",
  rank: "posição no ranking do TripAdvisor",
  mentions: "menções em matérias do CityNews",
  completeness: "completude das informações do lugar",
};

/** Percentuais inteiros que somam 100 (maior resto). */
function percentages(values: number[]): number[] {
  const sum = values.reduce((a, b) => a + b, 0) || 1;
  const raw = values.map((v) => (v / sum) * 100);
  const floor = raw.map(Math.floor);
  let rest = 100 - floor.reduce((a, b) => a + b, 0);
  const byRemainder = raw
    .map((r, i) => ({ i, rem: r - Math.floor(r) }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (const { i } of byRemainder) {
    if (rest <= 0) break;
    floor[i] = (floor[i] ?? 0) + 1;
    rest -= 1;
  }
  return floor;
}

export function listCriteriaText(
  t: GuideTemplate,
  weights: Weights,
  opts: { signals?: Partial<Record<Signal, boolean>> } = {},
): string {
  const w = normalizeWeights(weights);
  const used = ORDER.filter((s) => (opts.signals?.[s] ?? true) && w[s] > 0);
  if (used.length === 0) used.push("completeness");
  const pct = percentages(used.map((s) => (w[s] > 0 ? w[s] : 1)));
  const parts = used.map((s, i) => `${PHRASE[s]} (${pct[i]}%)`);
  const list =
    parts.length === 1
      ? (parts[0] ?? "")
      : `${parts.slice(0, -1).join("; ")}; e ${parts[parts.length - 1]}`;
  const what = t.noun ?? t.category;
  const where = t.neighborhood ? `Cuiabá, no bairro ${t.neighborhood}` : "Cuiabá";
  return (
    `Reunimos ${what} de ${where} com dados públicos e ordenamos por ${used.length === 1 ? "um sinal" : `${used.length} sinais`}: ${list}. ` +
    `Só entram lugares com pelo menos ${MIN_RATING_COUNT} avaliações. ` +
    `Os dados vêm de fontes públicas, citadas na lista. Patrocínio nunca altera a ordem da lista.`
  );
}
