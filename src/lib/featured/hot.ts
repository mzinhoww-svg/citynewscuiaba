/*
 * Pauta quente (spec 2026-10-03-destaques-e-profundidade, emenda R8 a R11): um assunto é quente
 * quando portais distintos o colocam no topo da página inicial (rank ≤ 3) dentro de 6 h, com
 * pelo menos `hot_min_sources` (padrão 3) fontes. A mesma fonte com vários links conta 1; sinal
 * sem assunto (URL sem item coletado) não conta. A cobertura simultânea (muitas fontes noticiando,
 * sem estar no topo) só vira pontuação de apoio e nunca torna um assunto quente sozinha.
 */
export type FrontSignal = { sourceId: string; topicId: string; rank: number; seenAt: Date };
export type HotTopic = { topicId: string; sources: number; lastSeenAt: Date };
export type HotOptions = { minSources?: number; windowHours?: number; maxRank?: number };

export const HOT_DEFAULTS = { minSources: 3, windowHours: 6, maxRank: 3 } as const;
/** Cobertura simultânea mínima para apoio (só pontuação). */
export const SUPPORT_MIN_SOURCES = 3;
/** Com esta cobertura (ou mais) o apoio chega ao teto 1. */
const SUPPORT_FULL_SOURCES = 6;

const HOUR_MS = 3_600_000;

export function detectHot(signals: FrontSignal[], now: Date, opts: HotOptions = {}): HotTopic[] {
  const minSources = Math.max(1, opts.minSources ?? HOT_DEFAULTS.minSources);
  const windowHours = opts.windowHours ?? HOT_DEFAULTS.windowHours;
  const maxRank = opts.maxRank ?? HOT_DEFAULTS.maxRank;
  const until = now.getTime();
  const since = until - windowHours * HOUR_MS;

  const byTopic = new Map<string, { sources: Set<string>; last: number }>();
  for (const s of signals) {
    const t = s.seenAt.getTime();
    if (!s.topicId || s.rank < 1 || s.rank > maxRank || t < since || t > until) continue;
    const acc = byTopic.get(s.topicId) ?? { sources: new Set<string>(), last: t };
    acc.sources.add(s.sourceId);
    acc.last = Math.max(acc.last, t);
    byTopic.set(s.topicId, acc);
  }

  const hot: HotTopic[] = [];
  for (const [topicId, acc] of byTopic) {
    if (acc.sources.size >= minSources)
      hot.push({ topicId, sources: acc.sources.size, lastSeenAt: new Date(acc.last) });
  }
  return hot.sort(
    (a, b) => b.sources - a.sources || b.lastSeenAt.getTime() - a.lastSeenAt.getTime(),
  );
}

/**
 * Apoio por cobertura simultânea (fontes distintas noticiando o assunto nas últimas 3 h, contadas
 * por quem chama): só pontuação entre 0 e 1 para a ordem automática, nunca um `HotTopic`.
 * Abaixo de 3 fontes o assunto não entra no mapa. `now` fica na assinatura para a janela de quem
 * chama e para uma futura queda com o tempo.
 */
export function supportScore(
  coverage: { topicId: string; sources: number }[],
  now: Date,
): Map<string, number> {
  void now;
  const score = new Map<string, number>();
  for (const c of coverage) {
    if (!c.topicId || c.sources < SUPPORT_MIN_SOURCES) continue;
    const v = Math.min(1, c.sources / SUPPORT_FULL_SOURCES);
    score.set(c.topicId, Math.max(score.get(c.topicId) ?? 0, v));
  }
  return score;
}
