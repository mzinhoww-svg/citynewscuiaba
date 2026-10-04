import { mergeRecord, mergeVenueLists } from "@/lib/guide/merge";
import type { SiteError, SiteFacts } from "@/lib/guide/providers/site";
import type { ProviderError, VenueProvider } from "@/lib/guide/providers/types";
import type { Venue, VenueRecord } from "@/lib/guide/types";
import type { Result } from "@/lib/result";

/**
 * Passo `venue_sync` (GUIA-T2): mantém a tabela de lugares com dados de fontes abertas e oficiais.
 * Por categoria: OpenStreetMap (lista), TripAdvisor (nota, contagem e posição, só com chave e
 * dentro da cota diária) e o site oficial (contato e horário, respeitando `robots.txt`); os
 * registros são mesclados com o que já existe (por id de provedor ou por nome e coordenada) e
 * gravados. A nota e a contagem são refeitas a cada 30 dias. Sem `TRIPADVISOR_API_KEY` o passo
 * segue em modo de pesquisa web (R33) e registra `tripadvisor: "no_key"` no relatório.
 */

export const RATING_MAX_AGE_DAYS = 30;

export interface StoredVenue extends Venue {
  /** Quando a nota e a contagem foram conferidas por último. */
  ratingUpdatedAt: string | null;
}

export interface VenueSyncStore {
  /** Lugares da categoria já cadastrados (qualquer status, para não duplicar). */
  loadCategory(category: string): Promise<StoredVenue[]>;
  /** Com TripAdvisor e nota vencida (mais velhos primeiro). */
  staleRatings(before: Date, limit: number): Promise<StoredVenue[]>;
  save(
    changes: {
      inserts: VenueRecord[];
      updates: { id: string; record: VenueRecord; ratingChecked: boolean }[];
    },
    at: Date,
  ): Promise<{ inserted: number; updated: number }>;
}

export interface VenueSyncDeps {
  osm: VenueProvider;
  /** `null` = sem chave (modo de pesquisa web). */
  tripadvisor: VenueProvider | null;
  site: (website: string) => Promise<Result<SiteFacts, SiteError>>;
  store: VenueSyncStore;
  now: () => Date;
  /** Chamadas à API do TripAdvisor que ainda cabem hoje (cota e custo). */
  taCallsLeft: () => Promise<number>;
  /** Contagem de chamadas feitas nesta execução (a rota liga a `onCall` do provedor). */
  taCallsMade: () => number;
}

export interface VenueSyncPlan {
  categories: { category: string; subcategory?: string | null }[];
  area: string;
  /** Lugares de cada categoria que ganham detalhes do TripAdvisor por execução. */
  maxTaDetailsPerCategory?: number;
  /** Sites oficiais lidos por execução. */
  maxSites?: number;
  /** Lugares com nota vencida refeitos por execução. */
  maxRefresh?: number;
}

export type ProviderStatus = "ok" | "no_key" | "budget" | `error:${ProviderError}`;

export interface VenueSyncReport {
  startedAt: string;
  providers: { osm: ProviderStatus; tripadvisor: ProviderStatus; site: "ok" | "skipped" };
  categories: {
    category: string;
    subcategory: string | null;
    osm: number;
    tripadvisor: number;
    inserted: number;
    updated: number;
  }[];
  taCalls: number;
  sitesChecked: number;
  sitesBlocked: number;
  refreshed: number;
}

export async function runVenueSync(
  deps: VenueSyncDeps,
  plan: VenueSyncPlan,
): Promise<VenueSyncReport> {
  const at = deps.now();
  const maxDetails = plan.maxTaDetailsPerCategory ?? 25;
  let maxSites = plan.maxSites ?? 20;
  const ta = deps.tripadvisor;
  const report: VenueSyncReport = {
    startedAt: at.toISOString(),
    providers: { osm: "ok", tripadvisor: ta ? "ok" : "no_key", site: "ok" },
    categories: [],
    taCalls: 0,
    sitesChecked: 0,
    sitesBlocked: 0,
    refreshed: 0,
  };
  let taOff = ta === null;

  /** Reserva uma chamada da cota; sem espaço, o TripAdvisor para até a próxima janela. */
  const taAllowed = async (): Promise<boolean> => {
    if (taOff) return false;
    const left = await deps.taCallsLeft();
    if (left - deps.taCallsMade() <= 0) {
      taOff = true;
      report.providers.tripadvisor = "budget";
      return false;
    }
    return true;
  };
  const taFailed = (e: ProviderError) => {
    if (e === "no_key" || e === "unauthorized" || e === "rate_limited") {
      taOff = true;
      report.providers.tripadvisor = e === "no_key" ? "no_key" : `error:${e}`;
    }
  };

  /** Lê o site oficial de cada registro (dentro do limite) e devolve cópias com os fatos achados. */
  const enrichSites = async (records: VenueRecord[]): Promise<VenueRecord[]> => {
    const out: VenueRecord[] = [];
    for (const rec of records) {
      if (maxSites <= 0 || !rec.website || rec.sources.includes("site")) {
        out.push(rec);
        continue;
      }
      maxSites -= 1;
      const r = await deps.site(rec.website);
      report.sitesChecked += 1;
      if (!r.ok) {
        if (r.error === "robots") report.sitesBlocked += 1;
        out.push(rec);
        continue;
      }
      const f = r.value;
      out.push({
        ...rec,
        phone: rec.phone ?? f.phone,
        hours: rec.hours ?? f.hours,
        instagram: rec.instagram ?? f.instagram,
        address: rec.address ?? f.address,
        sources: [...new Set([...rec.sources, "site" as const])],
      });
    }
    return out;
  };

  for (const { category, subcategory = null } of plan.categories) {
    const entry = { category, subcategory, osm: 0, tripadvisor: 0, inserted: 0, updated: 0 };
    const incoming: VenueRecord[] = [];
    const rated = new Set<string>();

    const o = await deps.osm.search({ category, subcategory, area: plan.area });
    if (o.ok) {
      entry.osm = o.value.length;
      incoming.push(...o.value);
    } else {
      report.providers.osm = `error:${o.error}`;
    }

    if (ta && (await taAllowed())) {
      const s = await ta.search({ category, subcategory, area: plan.area, limit: maxDetails });
      if (s.ok) {
        for (const base of s.value.slice(0, maxDetails)) {
          const id = base.placeIds.tripadvisor;
          if (!id || !(await taAllowed())) break;
          const d = await ta.details(id);
          if (!d.ok) {
            taFailed(d.error);
            if (taOff) break;
            continue;
          }
          if (d.value) {
            incoming.push({
              ...d.value,
              category,
              subcategory: subcategory ?? d.value.subcategory,
            });
            if (id) rated.add(id);
            entry.tripadvisor += 1;
          }
        }
      } else {
        taFailed(s.error);
      }
    }

    const existing = await deps.store.loadCategory(category);
    const merged = mergeVenueLists(existing, incoming);
    const inserts = await enrichSites(merged.inserts);
    const updatedRecords = await enrichSites(merged.updates.map((u) => u.record));
    const ratingChecked = (rec: VenueRecord) => {
      const id = rec.placeIds.tripadvisor;
      return id !== undefined && rated.has(id);
    };
    const saved = await deps.store.save(
      {
        inserts,
        updates: merged.updates.map((u, i) => ({
          id: u.existing.id,
          record: updatedRecords[i] ?? u.record,
          ratingChecked: ratingChecked(u.record),
        })),
      },
      at,
    );
    entry.inserted = saved.inserted;
    entry.updated = saved.updated;
    report.categories.push(entry);
  }

  // Nota e contagem vencidas (30 dias): só o TripAdvisor, só dentro da cota.
  if (ta && !taOff) {
    const before = new Date(at.getTime() - RATING_MAX_AGE_DAYS * 86_400_000);
    const stale = await deps.store.staleRatings(before, plan.maxRefresh ?? 25);
    const updates: { id: string; record: VenueRecord; ratingChecked: boolean }[] = [];
    for (const v of stale) {
      const id = v.placeIds.tripadvisor;
      if (!id || !(await taAllowed())) break;
      const d = await ta.details(id);
      if (!d.ok) {
        taFailed(d.error);
        if (taOff) break;
        continue;
      }
      if (d.value) {
        updates.push({ id: v.id, record: mergeRecord(v, d.value), ratingChecked: true });
        report.refreshed += 1;
      }
    }
    if (updates.length > 0) await deps.store.save({ inserts: [], updates }, at);
  }

  report.taCalls = deps.taCallsMade();
  return report;
}
