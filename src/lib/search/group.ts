/** Resultado da consulta híbrida já fundido por RRF, antes de hidratar (ordem = relevância). */
export interface RankedHit {
  kind: "article" | "topic" | "event" | "aggregated";
  id: string;
  /** Assunto do item (para o próprio assunto, o id dele). */
  topicId: string | null;
  score: number;
}

export interface HitGroup {
  /** Assunto que agrupa 2+ itens; `null` = resultado solto. */
  topicId: string | null;
  hits: RankedHit[];
}

/**
 * Agrupa por assunto quando há 2 ou mais itens (matérias, agregados) do mesmo assunto (P12).
 * O grupo fica na posição do melhor item dele; o resultado do próprio assunto vira o cabeçalho
 * do grupo e sai da lista. Assunto com um só item não agrupa.
 */
export function groupHits(hits: RankedHit[]): HitGroup[] {
  const members = new Map<string, number>();
  for (const h of hits) {
    if (h.kind !== "topic" && h.topicId) members.set(h.topicId, (members.get(h.topicId) ?? 0) + 1);
  }
  const grouped = (topicId: string | null) => !!topicId && (members.get(topicId) ?? 0) >= 2;

  const groups: HitGroup[] = [];
  const byTopic = new Map<string, HitGroup>();
  for (const h of hits) {
    if (!grouped(h.topicId)) {
      groups.push({ topicId: null, hits: [h] });
      continue;
    }
    const topicId = h.topicId as string;
    let g = byTopic.get(topicId);
    if (!g) {
      g = { topicId, hits: [] };
      byTopic.set(topicId, g);
      groups.push(g);
    }
    if (h.kind !== "topic") g.hits.push(h);
  }
  return groups;
}
