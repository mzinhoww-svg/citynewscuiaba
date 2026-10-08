import { localDateKey } from "@/lib/format/date";
import { fold } from "@/lib/text/fold";
import { titleSimilarity } from "./dedupe";
import type { EvidenceConflict } from "./extract/evidence";
import type { NormalizedEvent } from "./types";

/** Limite de similaridade de título para confirmar (mais rígido que o do dedupe, 0,6). */
export const CONFIRM_SIMILARITY = 0.85;

const venueKey = (v: string) => fold(v).replace(/\s+/g, " ").trim();

function matches(e: NormalizedEvent, c: NormalizedEvent): boolean {
  if (e.dedupeKey === c.dedupeKey) return true;
  if (localDateKey(e.startsAt) !== localDateKey(c.startsAt)) return false;
  const ve = venueKey(e.venue);
  const vc = venueKey(c.venue);
  if (ve && vc && ve !== vc) return false;
  return titleSimilarity(e.dedupeKey, c.dedupeKey) >= CONFIRM_SIMILARITY;
}

function conflictOf(e: NormalizedEvent, c: NormalizedEvent): EvidenceConflict | null {
  if (e.startsAt !== c.startsAt)
    return {
      campo: localDateKey(e.startsAt) === localDateKey(c.startsAt) ? "horario" : "data",
      descoberta: e.startsAt,
      venue: c.venue,
    };
  if (venueKey(c.venue) && venueKey(e.venue) !== venueKey(c.venue))
    return { campo: "local", descoberta: e.venue, venue: c.venue };
  return null;
}

/**
 * Confirmação cruzada: evento de descoberta (`confirms = false`) que uma fonte que confirma
 * (`confirmed`) também lista passa a apontar para ela (`confirmedBySourceId`) e adota data,
 * horário e local dela; a divergência fica em `evidence.conflito`. Sem par, volta igual.
 * A `dedupeKey` do evento nunca muda: ela é a identidade da linha (uma linha por evento real).
 */
export function confirmEvents(
  events: readonly NormalizedEvent[],
  confirmed: readonly NormalizedEvent[],
): NormalizedEvent[] {
  return events.map((e) => {
    if (e.confirms) return e;
    let pair: NormalizedEvent | undefined;
    let best = -1;
    for (const c of confirmed) {
      if (!c.confirms || !matches(e, c)) continue;
      const sim = e.dedupeKey === c.dedupeKey ? 1 : titleSimilarity(e.dedupeKey, c.dedupeKey);
      if (sim > best) {
        best = sim;
        pair = c;
      }
    }
    if (!pair) return e;
    const conflito = conflictOf(e, pair);
    const startsAt = pair.startsAt;
    const venue = pair.venue || e.venue;
    return {
      ...e,
      startsAt,
      endsAt: e.startsAt === pair.startsAt ? e.endsAt : pair.endsAt,
      venue,
      confirmedBySourceId: pair.sourceRef,
      evidence: conflito ? { ...e.evidence, conflito } : e.evidence,
    };
  });
}
