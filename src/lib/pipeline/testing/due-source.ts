import type { MemorySource } from "./memory-run-store";

/** Fonte de teste com padrões neutros (30 min, prioridade normal, score 3, nunca coletada). */
export function dueSource(slug: string, o: Partial<MemorySource> = {}): MemorySource {
  return {
    id: `src-${slug}`,
    slug,
    priority: 2,
    editorialScore: 3,
    frequencyMinutes: null,
    crawlDelaySec: null,
    termsMinIntervalMinutes: null,
    rateLimitPerHour: 60,
    lastFetchedAt: null,
    ...o,
  };
}
