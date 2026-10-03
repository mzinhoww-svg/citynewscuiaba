import "server-only";
import { createHash } from "node:crypto";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { localDateKey } from "@/lib/format/date";
import { slugify } from "@/lib/pipeline/slug";
import type { CollectReport, ExistingEvent } from "@/lib/agenda/collect";
import type { NormalizedEvent } from "@/lib/agenda/types";

/** Slug estável por evento (mesma chave de duplicidade, mesmo endereço). */
export function eventSlug(e: Pick<NormalizedEvent, "title" | "startsAt" | "dedupeKey">): string {
  const h = createHash("sha1").update(e.dedupeKey).digest("hex").slice(0, 6);
  const [, m = "", d = ""] = localDateKey(e.startsAt).split("-");
  return `${slugify(e.title, 60)}-${d}${m}-${h}`;
}

/** Acesso a banco da coleta da Agenda (service role). */
export function createAgendaStore(db: DbClient) {
  return {
    /** Eventos futuros no ar sem origem de coleta (manuais e de leitores). */
    async existing(now: Date): Promise<ExistingEvent[]> {
      const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
      const { data, error } = await db
        .from("event_listings")
        .select("title, starts_at, venue")
        .is("dedupe_key", null)
        .gte("starts_at", since)
        .limit(1000);
      if (error) throw new Error(`agenda existing: ${error.message}`);
      return (data ?? []).map((r) => ({ title: r.title, startsAt: r.starts_at, venue: r.venue }));
    },

    /** Insere ou atualiza pela chave de duplicidade; confirma na hora (aprovação automática). */
    async save(events: NormalizedEvent[], at: Date): Promise<number> {
      const rows = events.map((e) => ({
        slug: eventSlug(e),
        title: e.title,
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        venue: e.venue,
        neighborhood: e.neighborhood,
        price_cents: e.priceCents,
        price_unknown: e.priceUnknown,
        age_rating: "consulte",
        category: e.category,
        origin: e.origin,
        description: e.description,
        source_url: e.sourceUrl,
        source_id: e.sourceId,
        dedupe_key: e.dedupeKey,
        confirmed_at: at.toISOString(),
        collected_at: at.toISOString(),
      }));
      const { error } = await db.from("event_listings").upsert(rows, { onConflict: "dedupe_key" });
      if (error) throw new Error(`agenda save: ${error.message}`);
      return rows.length;
    },

    async lastRunStartedAt(): Promise<Date | null> {
      const { data, error } = await db
        .from("agenda_collect_runs")
        .select("started_at")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`agenda lastRun: ${error.message}`);
      return data ? new Date(data.started_at) : null;
    },

    async startRun(trigger: "cron" | "manual", at: Date): Promise<string> {
      const { data, error } = await db
        .from("agenda_collect_runs")
        .insert({ trigger, started_at: at.toISOString() })
        .select("id")
        .single();
      if (error) throw new Error(`agenda startRun: ${error.message}`);
      return data.id;
    },

    async finishRun(id: string, report: CollectReport): Promise<void> {
      const { error } = await db
        .from("agenda_collect_runs")
        .update({ finished_at: new Date().toISOString(), report: report as unknown as Json })
        .eq("id", id);
      if (error) throw new Error(`agenda finishRun: ${error.message}`);
    },
  };
}
