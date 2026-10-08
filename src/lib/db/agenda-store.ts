import "server-only";
import { createHash } from "node:crypto";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { dayStart, localDateKey } from "@/lib/format/date";
import { dayStartCuiaba } from "@/lib/ai/registry";
import { slugify } from "@/lib/pipeline/slug";
import { afterFetch, type FetchOutcome } from "@/lib/sources/status";
import { AUTO_PAUSE_DEDUPE_SEC } from "@/lib/pipeline/steps/fetch";
import type { CollectReport, ExistingEvent, StoredCollected } from "@/lib/agenda/collect";
import { normalizeAgeRating } from "@/lib/agenda/age-rating";
import { parseEvidence } from "@/lib/agenda/extract/evidence";
import type { NormalizedEvent } from "@/lib/agenda/types";
import type { VenueCandidate } from "@/lib/agenda/venue-match";
import { createIngestRepo, toJsonObject } from "./pipeline-store";

/** Slug estável por evento (mesma chave de duplicidade, mesmo endereço). */
export function eventSlug(e: Pick<NormalizedEvent, "title" | "startsAt" | "dedupeKey">): string {
  const h = createHash("sha1").update(e.dedupeKey).digest("hex").slice(0, 6);
  const [, m = "", d = ""] = localDateKey(e.startsAt).split("-");
  return `${slugify(e.title, 60)}-${d}${m}-${h}`;
}

/** Linhas de `agenda_extract_cache` mais velhas que isto saem no início de cada execução real. */
const CACHE_TTL_MS = 30 * 86_400_000;
const CHUNK = 200;
const DEFAULT_PER_RUN = 40;
const DEFAULT_PER_DAY = 160;

const iso = (v: string) => new Date(v).toISOString();
const chunks = <T>(list: readonly T[]): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
};

const STORED_COLUMNS =
  "id, title, starts_at, ends_at, venue, neighborhood, price_cents, price_unknown, category, description, source_url, source_id, source_ref, origin, dedupe_key, confirmed_by_source_id, evidence, organizer, age_rating, media_id, venue_id, locked_fields, withdrawn_at, source:sources!event_listings_source_ref_fkey(confirms)";

const statsOf = (s: CollectReport["sources"][number]) => ({
  status: s.status,
  ...(s.detail ? { detail: s.detail } : {}),
  found: s.found,
  approved: s.approved,
  rejected: s.rejected,
  confirmed: s.confirmed,
  new: s.new,
  updated: s.updated,
  rejectedSamples: s.rejectedSamples,
  images: s.images,
  imageSkipped: s.imageSkipped,
});

/** Acesso a banco da coleta da Agenda (service role). */
export function createAgendaStore(db: DbClient) {
  /** Dos uuids dados, os que existem em `sources` (fixtures e fontes apagadas ficam de fora). */
  async function knownSources(ids: readonly string[]): Promise<Set<string>> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Set();
    const { data, error } = await db.from("sources").select("id").in("id", unique);
    if (error) throw new Error(`agenda knownSources: ${error.message}`);
    return new Set((data ?? []).map((r) => r.id));
  }

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

    /**
     * Eventos coletados já guardados (retirados inclusive) com uma destas chaves ou nos mesmos
     * dias locais delas: identidade da linha, travas, retirada e confirmação entre fontes.
     */
    async stored(keys: string[]): Promise<StoredCollected[]> {
      const unique = [...new Set(keys)];
      if (unique.length === 0) return [];
      const days = [...new Set(unique.map((k) => k.split("|")[1] ?? ""))]
        .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
        .sort();
      type Row = Awaited<ReturnType<typeof fetchByKeys>>[number];
      async function fetchByKeys(part: string[]) {
        const { data, error } = await db
          .from("event_listings")
          .select(STORED_COLUMNS)
          .in("dedupe_key", part);
        if (error) throw new Error(`agenda stored: ${error.message}`);
        return data ?? [];
      }
      const rows = new Map<string, Row>();
      for (const part of chunks(unique)) for (const r of await fetchByKeys(part)) rows.set(r.id, r);
      if (days.length > 0) {
        const from = dayStart(days[0] ?? "").toISOString();
        const to = new Date(dayStart(days.at(-1) ?? "").getTime() + 86_400_000).toISOString();
        const daySet = new Set(days);
        const { data, error } = await db
          .from("event_listings")
          .select(STORED_COLUMNS)
          .not("dedupe_key", "is", null)
          .gte("starts_at", from)
          .lt("starts_at", to)
          .limit(5000);
        if (error) throw new Error(`agenda stored(dias): ${error.message}`);
        for (const r of data ?? []) if (daySet.has(localDateKey(r.starts_at))) rows.set(r.id, r);
      }
      const out: StoredCollected[] = [];
      for (const r of rows.values()) {
        if (!r.dedupe_key) continue;
        out.push({
          id: r.id,
          lockedFields: r.locked_fields,
          withdrawnAt: r.withdrawn_at,
          title: r.title,
          startsAt: iso(r.starts_at),
          endsAt: r.ends_at ? iso(r.ends_at) : null,
          venue: r.venue,
          neighborhood: r.neighborhood,
          priceCents: r.price_cents,
          priceUnknown: r.price_unknown,
          category: r.category,
          description: r.description ?? "",
          sourceUrl: r.source_url ?? "",
          sourceId: r.source_id ?? "",
          sourceRef: r.source_ref,
          origin: r.origin === "official" ? "official" : "organizer",
          dedupeKey: r.dedupe_key,
          confirms: r.source?.confirms === true,
          confirmedBySourceId: r.confirmed_by_source_id,
          evidence: parseEvidence(r.evidence),
          organizer: r.organizer,
          ageRating: normalizeAgeRating(r.age_rating),
          mediaId: r.media_id,
          venueId: r.venue_id,
        });
      }
      return out;
    },

    /**
     * Insere ou atualiza pela chave de duplicidade; confirma na hora (aprovação automática).
     * Linha existente mantém o slug (o endereço não muda quando a confirmação muda a data);
     * `locked_fields` e `withdrawn_at` nunca são escritos aqui.
     */
    async save(events: NormalizedEvent[], at: Date): Promise<number> {
      if (events.length === 0) return 0;
      const keys = events.map((e) => e.dedupeKey);
      const slugs = new Map<string, string>();
      for (const part of chunks(keys)) {
        const { data, error } = await db
          .from("event_listings")
          .select("dedupe_key, slug")
          .in("dedupe_key", part);
        if (error) throw new Error(`agenda save(slugs): ${error.message}`);
        for (const r of data ?? []) if (r.dedupe_key) slugs.set(r.dedupe_key, r.slug);
      }
      const known = await knownSources(
        events.flatMap((e) => [e.sourceRef, e.confirmedBySourceId].filter((x) => x !== null)),
      );
      const ref = (id: string | null) => (id !== null && known.has(id) ? id : null);
      const stamp = at.toISOString();
      const rows = events.map((e) => ({
        slug: slugs.get(e.dedupeKey) ?? eventSlug(e),
        title: e.title,
        starts_at: e.startsAt,
        ends_at: e.endsAt,
        venue: e.venue,
        neighborhood: e.neighborhood,
        price_cents: e.priceCents,
        price_unknown: e.priceUnknown,
        age_rating: e.ageRating,
        organizer: e.organizer,
        media_id: e.mediaId,
        venue_id: e.venueId,
        category: e.category,
        origin: e.origin,
        description: e.description,
        source_url: e.sourceUrl,
        source_id: e.sourceId,
        source_ref: ref(e.sourceRef),
        confirmed_by_source_id: ref(e.confirmedBySourceId),
        evidence: toJsonObject({ ...e.evidence }),
        dedupe_key: e.dedupeKey,
        confirmed_at: stamp,
        collected_at: stamp,
        updated_at: stamp,
      }));
      const { error } = await db.from("event_listings").upsert(rows, { onConflict: "dedupe_key" });
      if (error) throw new Error(`agenda save: ${error.message}`);
      return rows.length;
    },

    /**
     * Lugares ativos do Guia para o vínculo `venue_id` (uma leitura por execução): o mesmo
     * conjunto do Estúdio (`agenda_venue_candidates`, migration 0204).
     */
    async activeVenues(): Promise<VenueCandidate[]> {
      const { data, error } = await db.rpc("agenda_venue_candidates");
      if (error) throw new Error(`agenda activeVenues: ${error.message}`);
      return data ?? [];
    },

    async cacheGet(url: string, hash: string): Promise<unknown | null> {
      const { data, error } = await db
        .from("agenda_extract_cache")
        .select("result")
        .eq("url", url)
        .eq("content_hash", hash)
        .maybeSingle();
      if (error) throw new Error(`agenda cacheGet: ${error.message}`);
      return data?.result ?? null;
    },

    async cachePut(url: string, hash: string, result: unknown): Promise<void> {
      if (typeof result !== "object" || result === null || Array.isArray(result))
        throw new Error("agenda cachePut: resultado precisa ser objeto");
      const { error } = await db
        .from("agenda_extract_cache")
        .upsert(
          { url, content_hash: hash, result: toJsonObject({ ...result }) },
          { onConflict: "url,content_hash" },
        );
      if (error) throw new Error(`agenda cachePut: ${error.message}`);
    },

    /** Expurgo do cache de extração: linhas com mais de 30 dias. */
    async cachePurge(now: Date): Promise<void> {
      const { error } = await db
        .from("agenda_extract_cache")
        .delete()
        .lt("created_at", new Date(now.getTime() - CACHE_TTL_MS).toISOString());
      if (error) throw new Error(`agenda cachePurge: ${error.message}`);
    },

    /** Teto de páginas por execução e por dia (`app_settings`; padrão 40 e 160). */
    async aiLimits(): Promise<{ perRun: number; perDay: number }> {
      const { data, error } = await db
        .from("app_settings")
        .select("key, value")
        .in("key", ["agenda.ai_pages_per_run", "agenda.ai_pages_per_day"]);
      if (error) throw new Error(`agenda aiLimits: ${error.message}`);
      const num = (key: string, fallback: number) => {
        const v = Number(data?.find((r) => r.key === key)?.value);
        return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
      };
      return {
        perRun: num("agenda.ai_pages_per_run", DEFAULT_PER_RUN),
        perDay: num("agenda.ai_pages_per_day", DEFAULT_PER_DAY),
      };
    },

    /** Páginas enviadas ao modelo hoje (dia de Cuiabá), somando as linhas por fonte. */
    async aiPagesToday(now: Date): Promise<number> {
      const { data, error } = await db
        .from("agenda_collect_runs")
        .select("ai_pages")
        .not("source_id", "is", null)
        .gte("started_at", dayStartCuiaba(now).toISOString());
      if (error) throw new Error(`agenda aiPagesToday: ${error.message}`);
      return (data ?? []).reduce((n, r) => n + r.ai_pages, 0);
    },

    /**
     * Estado da fonte depois da busca, como o pipeline de notícias (`afterFetch`): só fonte ativa
     * ou com falhas é atualizada (pausa humana vence); na 3ª falha seguida, aviso no Control Center.
     */
    async sourceState(sourceUuid: string, outcome: FetchOutcome, detail?: string): Promise<void> {
      const { data: src, error } = await db
        .from("sources")
        .select("id, slug, name, status, consecutive_failures, archived_at")
        .eq("id", sourceUuid)
        .maybeSingle();
      if (error) throw new Error(`agenda sourceState: ${error.message}`);
      if (!src || src.archived_at !== null) return;
      if (src.status !== "active" && src.status !== "degraded") return;
      const patch = afterFetch(
        {
          status: src.status,
          // `afterFetch` só usa o contador; o motivo vem do próprio patch.
          statusReason: null,
          consecutiveFailures: src.consecutive_failures,
          archivedAt: null,
        },
        outcome,
      );
      const now = new Date().toISOString();
      const extra =
        outcome === "ok"
          ? { last_fetched_at: now, last_error: null }
          : outcome === "failed"
            ? { last_error: detail ?? "falha na coleta" }
            : {};
      if (Object.keys(extra).length > 0) {
        const up = await db
          .from("sources")
          .update(extra)
          .eq("id", src.id)
          .in("status", ["active", "degraded"])
          .is("archived_at", null);
        if (up.error) throw new Error(`agenda sourceState(update): ${up.error.message}`);
      }
      if (!patch) return;
      const ingest = createIngestRepo(db);
      await ingest.applySourceState(src.id, patch);
      if (patch.status === "paused") {
        const message = detail ?? "falha na coleta";
        await ingest.notifyOnce(
          {
            kind: "source_auto_paused",
            channel: "control_center",
            severity: "warn",
            objectRef: `source:${src.id}`,
            dedupeKey: `source_auto_paused:${src.id}`,
            title: `Fonte ${src.name} pausada após 3 falhas seguidas: ${message}`,
            body: `A fonte ${src.name} (${src.slug}) falhou em ${patch.consecutiveFailures ?? 3} coletas seguidas e foi pausada automaticamente. Último erro: ${message}. Retome pelo painel de fontes depois de corrigir.`,
          },
          AUTO_PAUSE_DEDUPE_SEC,
        );
      }
    },

    /** Última execução (só linhas-resumo, `source_id` nulo). */
    async lastRunStartedAt(): Promise<Date | null> {
      const { data, error } = await db
        .from("agenda_collect_runs")
        .select("started_at")
        .is("source_id", null)
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

    /** Fecha a linha-resumo e grava uma linha por fonte (`source_id`, `stats`, `ai_pages`). */
    async finishRun(id: string, report: CollectReport): Promise<void> {
      const finished = new Date().toISOString();
      const { data: run, error } = await db
        .from("agenda_collect_runs")
        .update({
          finished_at: finished,
          report: report as unknown as Json,
          ai_pages: report.aiPages,
          stats: toJsonObject({
            found: report.found,
            approved: report.approved,
            duplicates: report.duplicates,
            saved: report.saved,
          }),
        })
        .eq("id", id)
        .select("trigger")
        .single();
      if (error) throw new Error(`agenda finishRun: ${error.message}`);
      const known = await knownSources(report.sources.map((s) => s.uuid));
      const rows = report.sources
        .filter((s) => known.has(s.uuid))
        .map((s) => ({
          source_id: s.uuid,
          trigger: run.trigger,
          started_at: report.startedAt,
          finished_at: finished,
          ai_pages: s.aiPages,
          stats: toJsonObject(statsOf(s)),
        }));
      if (rows.length === 0) return;
      const ins = await db.from("agenda_collect_runs").insert(rows);
      if (ins.error) throw new Error(`agenda finishRun(fontes): ${ins.error.message}`);
    },

    /**
     * "Coletar agora" de uma fonte (painel, AGM-T6): grava só as linhas por fonte, sem linha-resumo
     * — a coleta manual de uma fonte não adia o próximo ciclo de todas (`lastRunStartedAt`) e
     * conta no teto do dia (`aiPagesToday` soma as linhas por fonte).
     */
    async finishSourceRun(report: CollectReport): Promise<void> {
      const finished = new Date().toISOString();
      const known = await knownSources(report.sources.map((s) => s.uuid));
      const rows = report.sources
        .filter((s) => known.has(s.uuid))
        .map((s) => ({
          source_id: s.uuid,
          trigger: "manual",
          started_at: report.startedAt,
          finished_at: finished,
          ai_pages: s.aiPages,
          report: { saved: report.saved, duplicates: report.duplicates } as Json,
          stats: toJsonObject(statsOf(s)),
        }));
      if (rows.length === 0) return;
      const ins = await db.from("agenda_collect_runs").insert(rows);
      if (ins.error) throw new Error(`agenda finishSourceRun: ${ins.error.message}`);
    },
  };
}
