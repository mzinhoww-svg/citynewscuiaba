import "server-only";
import type { AgendaSource, SourceKind } from "@/lib/agenda/types";
import type { DbClient } from "@/lib/db/client";

const KINDS: ReadonlySet<string> = new Set<SourceKind>([
  "jsonld",
  "ical",
  "rss",
  "sympla",
  "tribe",
  "ai_page",
]);
const isKind = (v: string | null): v is SourceKind => v !== null && KINDS.has(v);
const isOrigin = (v: string | null): v is AgendaSource["origin"] =>
  v === "official" || v === "organizer";

/**
 * Fontes de eventos de `sources` (`kind = 'events'`, AGM-T5), na ordem da duplicidade: as que
 * confirmam primeiro, depois prioridade e slug. `enabled` = ativa ou com falhas e não arquivada;
 * as demais vêm junto (prévia de uma fonte pausada, confirmação por fonte conhecida).
 */
export async function loadEventSources(db: DbClient): Promise<AgendaSource[]> {
  const { data, error } = await db
    .from("sources")
    .select(
      "id, slug, name, base_url, status, archived_at, confirms, extract_kind, event_origin, collector_notes, list_urls, require_city, default_venue, default_neighborhood, default_category",
    )
    .eq("kind", "events")
    .order("confirms", { ascending: false })
    .order("priority", { ascending: true })
    .order("slug", { ascending: true });
  if (error) throw new Error(`agenda sources: ${error.message}`);
  const out: AgendaSource[] = [];
  for (const r of data ?? []) {
    // A constraint `sources_events_need_extract_check` garante os dois; o filtro só estreita o tipo.
    if (!isKind(r.extract_kind) || !isOrigin(r.event_origin)) continue;
    out.push({
      id: r.slug,
      uuid: r.id,
      name: r.name,
      kind: r.extract_kind,
      url: r.base_url,
      origin: r.event_origin,
      enabled: (r.status === "active" || r.status === "degraded") && r.archived_at === null,
      confirms: r.confirms,
      notes: r.collector_notes,
      listUrls: r.list_urls,
      requireCity: r.require_city,
      ...(r.default_venue ? { defaultVenue: r.default_venue } : {}),
      ...(r.default_neighborhood ? { defaultNeighborhood: r.default_neighborhood } : {}),
      ...(r.default_category ? { defaultCategory: r.default_category } : {}),
    });
  }
  return out;
}
