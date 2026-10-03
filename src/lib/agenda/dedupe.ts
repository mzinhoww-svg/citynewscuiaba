import { localDateKey } from "@/lib/format/date";
import type { NormalizedEvent } from "./types";

const tokens = (key: string) =>
  new Set((key.split("|")[0] ?? "").split("-").filter((w) => w.length > 2));

function similar(a: NormalizedEvent, b: NormalizedEvent): boolean {
  if (a.dedupeKey === b.dedupeKey) return true;
  if (localDateKey(a.startsAt) !== localDateKey(b.startsAt)) return false;
  if (a.venue.toLowerCase() !== b.venue.toLowerCase()) return false;
  const ta = tokens(a.dedupeKey);
  const tb = tokens(b.dedupeKey);
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union > 0 && inter / union >= 0.6;
}

/**
 * Remove repetidos (mesmo título, dia e local, ou títulos muito parecidos no mesmo dia e local).
 * Fica o primeiro da lista; a ordem das fontes decide (oficial antes de organizador).
 */
export function dedupeEvents(list: readonly NormalizedEvent[]): NormalizedEvent[] {
  const kept: NormalizedEvent[] = [];
  for (const e of list) if (!kept.some((k) => similar(k, e))) kept.push(e);
  return kept;
}
