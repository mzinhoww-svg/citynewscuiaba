import { isQualifiedRead, WEAK_PROMOTION_DAYS } from "@/lib/events/weak";
import type { AnonProfile } from "./types";

/**
 * Interesses considerados (P21): editorias com leituras qualificadas no histórico local de 30
 * dias, sempre com a evidência que o leitor vê. Menos de 3 dias diferentes é sinal fraco
 * ("ainda não usado", tracking-plan §3). Só editorias: nunca inferir atributo sensível.
 */
export function deriveInterests(
  history: AnonProfile["history"],
  labels: Record<string, string>,
): AnonProfile["interests"] {
  const by = new Map<string, { reads: number; days: Set<string> }>();
  for (const h of history) {
    if (!h.section || !isQualifiedRead(h.seconds, h.scrollPct)) continue;
    const e = by.get(h.section) ?? { reads: 0, days: new Set<string>() };
    e.reads += 1;
    e.days.add(h.at.slice(0, 10));
    by.set(h.section, e);
  }
  return [...by.entries()]
    .sort((a, b) => b[1].reads - a[1].reads || a[0].localeCompare(b[0]))
    .map(([section, e]) => {
      const key = labels[section] ?? section;
      return {
        key,
        section,
        evidence: `${e.reads} ${e.reads === 1 ? "leitura" : "leituras"} em ${key} nos últimos 30 dias`,
        weak: e.days.size < WEAK_PROMOTION_DAYS,
      };
    });
}
