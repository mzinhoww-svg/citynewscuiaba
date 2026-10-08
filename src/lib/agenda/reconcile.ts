/**
 * Reconciliação dos eventos aprovados de uma execução com o que já está no banco (uma linha por
 * evento real, spec §4 passos 5 e 7). Pura: recebe os aprovados, os coletados já guardados e os
 * eventos manuais/de leitores; devolve o que gravar e as contagens por fonte (slug).
 */
import type { ExistingEvent, StoredCollected } from "./collect-context";
import { applyConfirmation, confirmEvents, findConfirmer } from "./confirm";
import { dedupeEvents } from "./dedupe";
import { mergeForSave } from "./merge";
import { dedupeKeyOf, describeEvent } from "./normalize";
import type { NormalizedEvent } from "./types";

export interface ReconcileResult {
  /** Eventos a gravar (travas aplicadas, retirados fora). */
  toSave: NormalizedEvent[];
  /** Aprovados desta execução que não viraram linha própria (repetidos ou já guardados). */
  duplicates: number;
  /** Por slug de fonte: descobertas confirmadas, linhas novas e linhas atualizadas. */
  confirmed: Map<string, number>;
  created: Map<string, number>;
  updated: Map<string, number>;
}

const placeholder = (e: ExistingEvent): NormalizedEvent => ({
  title: e.title,
  startsAt: e.startsAt,
  venue: e.venue,
  dedupeKey: dedupeKeyOf(e.title, e.startsAt, e.venue),
  endsAt: null,
  neighborhood: null,
  priceCents: null,
  priceUnknown: false,
  category: "",
  sourceUrl: "",
  sourceId: "",
  origin: "organizer",
  description: "",
  venueKnown: true,
  sourceRef: null,
  confirms: false,
  confirmedBySourceId: null,
  evidence: {},
});

const fromStored = (s: StoredCollected): NormalizedEvent => ({
  title: s.title,
  startsAt: s.startsAt,
  endsAt: s.endsAt,
  venue: s.venue,
  neighborhood: s.neighborhood,
  priceCents: s.priceCents,
  priceUnknown: s.priceUnknown,
  category: s.category,
  description: s.description,
  sourceUrl: s.sourceUrl,
  sourceId: s.sourceId,
  sourceRef: s.sourceRef,
  origin: s.origin,
  dedupeKey: s.dedupeKey,
  venueKnown: true,
  confirms: s.confirms,
  confirmedBySourceId: s.confirmedBySourceId,
  evidence: s.evidence,
});

const bump = (m: Map<string, number>, key: string) => m.set(key, (m.get(key) ?? 0) + 1);

/**
 * (a) descoberta confirmada por uma fonte desta execução: fica só o evento de quem confirma;
 * (b) descoberta já guardada que uma fonte desta execução confirma: atualiza a linha guardada
 *     (mesma chave e slug) com data, hora e local de quem confirma e `confirmedBySourceId`;
 * (c) descoberta igual a evento guardado de fonte que confirma: descartada;
 * eventos manuais/de leitores vencem; `mergeForSave` aplica travas e retirada.
 */
export function reconcile(
  all: readonly NormalizedEvent[],
  stored: readonly StoredCollected[],
  existing: readonly ExistingEvent[],
): ReconcileResult {
  const confirmed = new Map<string, number>();
  const created = new Map<string, number>();
  const updated = new Map<string, number>();
  const storedByKey = new Map(stored.map((s) => [s.dedupeKey, s]));
  const storedN = stored.map(fromStored);
  const runConfirmers = all.filter((e) => e.confirms);
  const slugOfUuid = new Map(
    runConfirmers.flatMap((e) => (e.sourceRef ? [[e.sourceRef, e.sourceId] as const] : [])),
  );

  // (b)
  const absorbed = new Set<NormalizedEvent>();
  const updates = new Set<NormalizedEvent>();
  const owner = new Map<NormalizedEvent, string>();
  for (const s of storedN) {
    if (s.confirms) continue;
    const probe = { ...s, confirmedBySourceId: null };
    const pair = findConfirmer(probe, runConfirmers);
    if (!pair) continue;
    absorbed.add(pair);
    const c = applyConfirmation(probe, pair);
    const upd = { ...c, description: describeEvent(c) };
    updates.add(upd);
    owner.set(upd, pair.sourceId);
    bump(confirmed, pair.sourceId);
  }

  // (c)
  const storedConfirmers = storedN.filter((s) => s.confirms);
  const rest = all.filter(
    (e) => !absorbed.has(e) && (e.confirms || !findConfirmer(e, storedConfirmers)),
  );

  // (a)
  const confirmedRun = confirmEvents(rest, runConfirmers);
  for (const e of confirmedRun) {
    if (e.confirms || !e.confirmedBySourceId) continue;
    const slug = slugOfUuid.get(e.confirmedBySourceId);
    if (slug) bump(confirmed, slug);
  }

  const merged = dedupeEvents([...existing.map(placeholder), ...updates, ...confirmedRun]);
  const fresh = merged.filter((e) => e.sourceId !== "");
  const toSave: NormalizedEvent[] = [];
  for (const e of fresh) {
    const prev = storedByKey.get(e.dedupeKey) ?? null;
    const out = mergeForSave(e, prev);
    if (!out) continue;
    toSave.push(out);
    bump(prev ? updated : created, owner.get(e) ?? e.sourceId);
  }
  const freshRun = fresh.filter((e) => !updates.has(e)).length;
  return {
    toSave,
    duplicates: all.length - absorbed.size - freshRun,
    confirmed,
    created,
    updated,
  };
}
