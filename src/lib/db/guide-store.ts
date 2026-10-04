import "server-only";
import { dayStartCuiaba } from "@/lib/ai/registry";
import type { DbClient } from "@/lib/db/client";
import type { Database, Json } from "@/lib/db/types";
import { targetKey, type SyncTarget } from "@/lib/guide/plan";
import type { DataSource, PlaceIds, VenueRecord } from "@/lib/guide/types";
import { DATA_SOURCES } from "@/lib/guide/types";
import { slugify } from "@/lib/pipeline/slug";
import type { StoredVenue, VenueSyncReport, VenueSyncStore } from "@/lib/pipeline/steps/venue-sync";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];
type VenueInsert = Database["public"]["Tables"]["venues"]["Insert"];

const isSource = (s: string): s is DataSource => (DATA_SOURCES as readonly string[]).includes(s);

export function venueFromRow(r: VenueRow): StoredVenue {
  const ids = (r.place_ids ?? {}) as Record<string, unknown>;
  const placeIds: PlaceIds = {};
  for (const k of ["osm", "tripadvisor", "wikidata"] as const) {
    const v = ids[k];
    if (typeof v === "string" && v) placeIds[k] = v;
  }
  const source = r.rating_source;
  return {
    id: r.id,
    slug: r.slug,
    status: r.status === "suspended" || r.status === "inactive" ? r.status : "active",
    dataUpdatedAt: r.data_updated_at,
    ratingUpdatedAt: r.rating_updated_at,
    name: r.name,
    category: r.category,
    subcategory: r.subcategory,
    neighborhood: r.neighborhood,
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    phone: r.phone,
    website: r.website,
    instagram: r.instagram,
    hours: r.hours,
    priceLevel: r.price_level,
    rating: r.rating,
    ratingCount: r.rating_count,
    ratingSource:
      source === "tripadvisor" || source === "google" || source === "manual" ? source : null,
    tripadvisorRank: r.tripadvisor_rank,
    tripadvisorUrl: r.tripadvisor_url,
    placeIds,
    sources: r.data_sources.filter(isSource),
  };
}

function rowFields(rec: VenueRecord) {
  return {
    name: rec.name,
    category: rec.category,
    subcategory: rec.subcategory,
    neighborhood: rec.neighborhood,
    address: rec.address,
    lat: rec.lat,
    lng: rec.lng,
    phone: rec.phone,
    website: rec.website,
    instagram: rec.instagram,
    hours: rec.hours,
    price_level: rec.priceLevel,
    rating: rec.rating,
    rating_count: rec.ratingCount,
    rating_source: rec.ratingSource,
    tripadvisor_rank: rec.tripadvisorRank,
    tripadvisor_url: rec.tripadvisorUrl,
    place_ids: rec.placeIds as Json,
    data_sources: rec.sources,
  };
}

/** Slug do lugar: nome e bairro (ou "cuiaba"), único com sufixo numérico. */
export function venueSlugBase(rec: Pick<VenueRecord, "name" | "neighborhood">): string {
  return slugify(`${rec.name} ${rec.neighborhood ?? "cuiaba"}`, 100);
}

/** Acesso a banco da coleta de lugares (service role). */
export function createGuideStore(db: DbClient): VenueSyncStore & {
  startRun(
    kind: "venue_sync" | "propose" | "refresh",
    trigger: "cron" | "manual",
    at: Date,
  ): Promise<string>;
  finishRun(id: string, report: unknown): Promise<void>;
  lastRunStartedAt(kind: "venue_sync" | "propose" | "refresh"): Promise<Date | null>;
  taCallsToday(now: Date): Promise<number>;
  lastSyncedTargets(): Promise<Map<string, string>>;
  templateTargets(): Promise<SyncTarget[]>;
} {
  return {
    async loadCategory(category) {
      const { data, error } = await db
        .from("venues")
        .select("*")
        .eq("category", category)
        .limit(5000);
      if (error) throw new Error(`venues load: ${error.message}`);
      return (data ?? []).map(venueFromRow);
    },

    async staleRatings(before, limit) {
      const { data, error } = await db
        .from("venues")
        .select("*")
        .eq("status", "active")
        .not("place_ids->>tripadvisor", "is", null)
        .or(`rating_updated_at.is.null,rating_updated_at.lt.${before.toISOString()}`)
        .order("rating_updated_at", { ascending: true, nullsFirst: true })
        .limit(limit);
      if (error) throw new Error(`venues stale: ${error.message}`);
      return (data ?? []).map(venueFromRow);
    },

    async save({ inserts, updates }, at) {
      let inserted = 0;
      if (inserts.length > 0) {
        const bases = [...new Set(inserts.map(venueSlugBase))];
        const taken = new Set<string>();
        for (const base of bases) {
          const { data, error } = await db.from("venues").select("slug").like("slug", `${base}%`);
          if (error) throw new Error(`venues slugs: ${error.message}`);
          for (const r of data ?? []) taken.add(r.slug);
        }
        const rows: VenueInsert[] = inserts.map((rec) => {
          const base = venueSlugBase(rec);
          let slug = base;
          for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;
          taken.add(slug);
          return {
            ...rowFields(rec),
            slug,
            data_updated_at: at.toISOString(),
            rating_updated_at: rec.sources.includes("tripadvisor") ? at.toISOString() : null,
          };
        });
        const { error } = await db.from("venues").insert(rows);
        if (error) throw new Error(`venues insert: ${error.message}`);
        inserted = rows.length;
      }
      for (const u of updates) {
        const { error } = await db
          .from("venues")
          .update({
            ...rowFields(u.record),
            data_updated_at: at.toISOString(),
            ...(u.ratingChecked ? { rating_updated_at: at.toISOString() } : {}),
          })
          .eq("id", u.id);
        if (error) throw new Error(`venues update: ${error.message}`);
      }
      return { inserted, updated: updates.length };
    },

    async startRun(kind, trigger, at) {
      const { data, error } = await db
        .from("guide_runs")
        .insert({ kind, trigger, started_at: at.toISOString() })
        .select("id")
        .single();
      if (error) throw new Error(`guide run start: ${error.message}`);
      return data.id;
    },

    async finishRun(id, report) {
      const { error } = await db
        .from("guide_runs")
        .update({ finished_at: new Date().toISOString(), report: report as Json })
        .eq("id", id);
      if (error) throw new Error(`guide run finish: ${error.message}`);
    },

    async lastRunStartedAt(kind) {
      const { data, error } = await db
        .from("guide_runs")
        .select("started_at")
        .eq("kind", kind)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`guide run last: ${error.message}`);
      return data ? new Date(data.started_at) : null;
    },

    /** Chamadas ao TripAdvisor já feitas hoje (dia de Cuiabá), somadas dos relatórios. */
    async taCallsToday(now) {
      const { data, error } = await db
        .from("guide_runs")
        .select("report")
        .eq("kind", "venue_sync")
        .gte("started_at", dayStartCuiaba(now).toISOString());
      if (error) throw new Error(`guide ta calls: ${error.message}`);
      return (data ?? []).reduce((sum, r) => {
        const n = (r.report as { taCalls?: unknown } | null)?.taCalls;
        return sum + (typeof n === "number" ? n : 0);
      }, 0);
    },

    async lastSyncedTargets() {
      const { data, error } = await db
        .from("guide_runs")
        .select("started_at, report")
        .eq("kind", "venue_sync")
        .not("report", "is", null)
        .order("started_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(`guide last synced: ${error.message}`);
      const out = new Map<string, string>();
      for (const run of data ?? []) {
        const cats = (run.report as Partial<VenueSyncReport> | null)?.categories ?? [];
        for (const c of cats) {
          const key = targetKey({ category: c.category, subcategory: c.subcategory ?? null });
          if (!out.has(key)) out.set(key, run.started_at);
        }
      }
      return out;
    },

    async templateTargets() {
      const { data, error } = await db
        .from("guide_templates")
        .select("category, subcategory")
        .eq("active", true);
      if (error) throw new Error(`guide templates: ${error.message}`);
      return (data ?? []).map((t) => ({ category: t.category, subcategory: t.subcategory }));
    },
  };
}
