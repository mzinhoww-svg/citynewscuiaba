import "server-only";
import { z } from "zod";
import type {
  ClusterRepo,
  EventSink,
  IngestRepo,
  RawPayload,
  RunStore,
  SourcePatch,
  SourceRecord,
} from "@/lib/pipeline/ports";
import { toSigned64, toUnsigned64 } from "@/lib/pipeline/simhash";
import { RawEntrySchema } from "@/lib/pipeline/types";
import { vectorLiteral } from "@/lib/pipeline/vector";
import type { DbClient } from "./client";
import type { Json } from "./types";

/** Serializa detalhes arbitrários como objeto JSON (descarta funções e valores não serializáveis). */
export function toJsonObject(value: Record<string, unknown> | undefined): { [key: string]: Json } {
  const parsed: unknown = JSON.parse(JSON.stringify(value ?? {}));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as { [key: string]: Json })
    : {};
}

/** Valor serializável como JSON do banco. */
function toJson(value: object): NonNullable<Json> {
  return JSON.parse(JSON.stringify(value)) as NonNullable<Json>;
}

function check(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`pipeline-store: ${op}: ${error.message}`);
}

/** `ingest_runs` e `sources` para o tick (service role). */
export function createRunStore(db: DbClient): RunStore {
  return {
    async startRun(windowStart) {
      const { data, error } = await db
        .rpc("start_ingest_run", { p_window: windowStart.toISOString() })
        .single();
      check("startRun", error);
      if (!data) throw new Error("pipeline-store: startRun sem retorno");
      const stats = data.stats;
      const fetchEnqueued =
        typeof stats === "object" && stats !== null && !Array.isArray(stats)
          ? "fetch_enqueued" in stats
          : false;
      return { runId: data.run_id, created: data.created, fetchEnqueued };
    },

    async markFetchEnqueued(runId, count) {
      const { error } = await db
        .from("ingest_runs")
        .update({ stats: { fetch_enqueued: count } })
        .eq("id", runId);
      check("markFetchEnqueued", error);
    },

    async previousOpenRun(windowStart) {
      const { data, error } = await db
        .from("ingest_runs")
        .select("id")
        .eq("status", "running")
        .lt("window_start", windowStart.toISOString())
        .order("window_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("previousOpenRun", error);
      return data?.id ?? null;
    },

    async activeSources() {
      const { data, error } = await db
        .from("sources")
        .select("slug, frequency_minutes, last_fetched_at")
        .eq("status", "active")
        .order("priority", { ascending: true })
        .order("slug", { ascending: true });
      check("activeSources", error);
      return (data ?? []).map((s) => ({
        slug: s.slug,
        frequencyMinutes: s.frequency_minutes,
        lastFetchedAt: s.last_fetched_at,
      }));
    },
  };
}

/** `pipeline_events` (append-only). */
export function createEventSink(db: DbClient): EventSink {
  return {
    async record(events) {
      if (events.length === 0) return;
      const { error } = await db.from("pipeline_events").insert(
        events.map((e) => ({
          run_id: e.runId,
          step: e.step,
          item_ref: e.itemRef,
          level: e.level,
          message: e.message.slice(0, 2000),
          details: toJsonObject(e.details),
        })),
      );
      check("record", error);
    },
  };
}

const RawPayloadSchema = z.object({
  url: z.string(),
  status: z.number().int(),
  contentType: z.string().nullable(),
  body: z.string(),
  sourceKind: z.enum(["rss", "sitemap", "api", "page", "newsletter", "social", "events"]),
});
const EntriesSchema = z.array(RawEntrySchema).nullable();

const SOURCE_COLUMNS =
  "id, slug, name, base_url, kind, feed_url, status, rate_limit_per_hour, locality, etag, last_modified";

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  kind: SourceRecord["kind"];
  feed_url: string | null;
  status: SourceRecord["status"];
  rate_limit_per_hour: number;
  locality: string;
  etag: string | null;
  last_modified: string | null;
}

const toSource = (r: SourceRow): SourceRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  baseUrl: r.base_url,
  kind: r.kind,
  feedUrl: r.feed_url,
  status: r.status,
  rateLimitPerHour: r.rate_limit_per_hour,
  locality: r.locality,
  etag: r.etag,
  lastModified: r.last_modified,
});

/** Banco das etapas de Coleta (service role). */
export function createIngestRepo(db: DbClient): IngestRepo {
  const source = async (column: "slug" | "id", value: string) => {
    const { data, error } = await db
      .from("sources")
      .select(SOURCE_COLUMNS)
      .eq(column, value)
      .maybeSingle();
    check("source", error);
    return data ? toSource(data) : null;
  };

  return {
    sourceBySlug: (slug) => source("slug", slug),
    sourceById: (id) => source("id", id),

    async updateSource(id, patch: SourcePatch) {
      const row = {
        ...(patch.feedUrl !== undefined ? { feed_url: patch.feedUrl } : {}),
        ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.lastError !== undefined ? { last_error: patch.lastError } : {}),
        ...(patch.etag !== undefined ? { etag: patch.etag } : {}),
        ...(patch.lastModified !== undefined ? { last_modified: patch.lastModified } : {}),
        ...(patch.lastFetchedAt !== undefined ? { last_fetched_at: patch.lastFetchedAt } : {}),
      };
      if (Object.keys(row).length === 0) return;
      const { error } = await db.from("sources").update(row).eq("id", id);
      check("updateSource", error);
    },

    async hitRateLimit(bucket, limit) {
      // "crawler:<slug>" → bucket "crawler", chave "<slug>" (fonte, não dado pessoal).
      const i = bucket.indexOf(":");
      const { data, error } = await db.rpc("hit_rate_limit", {
        p_bucket: i > 0 ? bucket.slice(0, i) : bucket,
        p_key_hash: i > 0 ? bucket.slice(i + 1) : "-",
        p_limit: limit,
        p_window_seconds: 3600,
      });
      check("hitRateLimit", error);
      return data === true;
    },

    async insertRawItem({ runId, sourceId, payload }) {
      const ins = await db
        .from("raw_items")
        .upsert(
          { run_id: runId, source_id: sourceId, payload: toJson(payload) },
          { onConflict: "run_id,source_id", ignoreDuplicates: true },
        )
        .select("id");
      check("insertRawItem", ins.error);
      const created = ins.data?.[0]?.id;
      if (created) return created;
      const { data, error } = await db
        .from("raw_items")
        .select("id")
        .eq("run_id", runId)
        .eq("source_id", sourceId)
        .single();
      check("insertRawItem(existing)", error);
      if (!data) throw new Error("pipeline-store: raw_item sumiu");
      return data.id;
    },

    async rawItem(id) {
      const { data, error } = await db
        .from("raw_items")
        .select("id, run_id, source_id, state, payload, entries")
        .eq("id", id)
        .maybeSingle();
      check("rawItem", error);
      if (!data) return null;
      const payload = RawPayloadSchema.safeParse(data.payload);
      const entries = EntriesSchema.safeParse(data.entries ?? null);
      if (!payload.success || !entries.success) return null;
      const state = data.state;
      if (state !== "new" && state !== "valid" && state !== "quarantine" && state !== "extracted")
        return null;
      const p: RawPayload = payload.data;
      return {
        id: data.id,
        runId: data.run_id,
        sourceId: data.source_id,
        state,
        payload: p,
        entries: entries.data,
      };
    },

    async updateRawItem(id, patch) {
      const { error } = await db
        .from("raw_items")
        .update({
          state: patch.state,
          ...(patch.entries !== undefined ? { entries: toJson(patch.entries) } : {}),
          ...(patch.error !== undefined ? { error: patch.error.slice(0, 2000) } : {}),
        })
        .eq("id", id);
      check("updateRawItem", error);
    },

    async insertCollectedItem(item) {
      const ins = await db
        .from("collected_items")
        .upsert(
          {
            raw_id: item.rawId,
            source_id: item.sourceId,
            canonical_url: item.canonicalUrl,
            original_title: item.originalTitle,
            excerpt: item.excerpt,
            author: item.author,
            published_at: item.publishedAt,
            image_url: item.imageUrl,
            locality: item.locality,
          },
          { onConflict: "canonical_url", ignoreDuplicates: true },
        )
        .select("id");
      check("insertCollectedItem", ins.error);
      const created = ins.data?.[0]?.id;
      if (created) return { id: created, created: true };
      const { data, error } = await db
        .from("collected_items")
        .select("id")
        .eq("canonical_url", item.canonicalUrl)
        .single();
      check("insertCollectedItem(existing)", error);
      if (!data) throw new Error("pipeline-store: collected_item sumiu");
      return { id: data.id, created: false };
    },
  };
}

const toVector = (v: readonly number[] | null | undefined): number[] | null =>
  Array.isArray(v) && v.length > 0 ? v.map(Number) : null;

/** Banco das etapas dedupe e cluster (service role). Simhash trafega como texto. */
export function createClusterRepo(db: DbClient): ClusterRepo {
  return {
    async collectedItem(id) {
      const { data, error } = await db.rpc("pipeline_item", { p_id: id }).maybeSingle();
      check("collectedItem", error);
      if (!data) return null;
      return {
        id: data.id,
        sourceId: data.source_id,
        title: data.title,
        excerpt: data.excerpt ?? null,
        publishedAt: data.published_at ?? null,
        simhash: data.simhash === null ? null : toUnsigned64(BigInt(data.simhash)),
        embedding: toVector(data.embedding),
        duplicateOf: data.duplicate_of ?? null,
        topicId: data.topic_id ?? null,
      };
    },

    async saveFingerprint(id, f) {
      const { error } = await db.rpc("save_item_fingerprint", {
        p_id: id,
        p_simhash: toSigned64(f.simhash).toString(),
        p_embedding: vectorLiteral(f.embedding),
      });
      check("saveFingerprint", error);
    },

    async dedupeCandidates(id, q) {
      const { data, error } = await db.rpc("dedupe_candidates", {
        p_id: id,
        p_simhash: toSigned64(q.simhash).toString(),
        p_since: q.since.toISOString(),
        p_max_hamming: q.maxHamming,
        p_min_cosine: q.minCosine,
        p_limit: q.limit,
      });
      check("dedupeCandidates", error);
      return (data ?? []).map((c) => ({
        id: c.id,
        simhash: toUnsigned64(BigInt(c.simhash)),
        cosine: typeof c.cosine === "number" ? c.cosine : null,
        topicId: c.topic_id ?? null,
      }));
    },

    async markDuplicate(id, originalId) {
      const { error } = await db.rpc("mark_item_duplicate", { p_id: id, p_original: originalId });
      check("markDuplicate", error);
    },

    async topicCandidates(id, q) {
      const { data, error } = await db.rpc("topic_candidates", {
        p_id: id,
        p_since: q.since.toISOString(),
        p_limit: q.limit,
      });
      check("topicCandidates", error);
      return (data ?? []).flatMap((t) => {
        const centroid = toVector(t.centroid);
        return centroid ? [{ topicId: t.topic_id, centroid, updatedAt: t.updated_at }] : [];
      });
    },

    async attachToTopic(id, topicId, now) {
      const { error } = await db.rpc("attach_item_to_topic", {
        p_id: id,
        p_topic: topicId,
        p_now: now.toISOString(),
      });
      check("attachToTopic", error);
    },

    async createTopic(id, t, now) {
      const { data, error } = await db.rpc("create_topic_for_item", {
        p_id: id,
        p_slug: t.slug,
        p_title: t.title,
        p_now: now.toISOString(),
      });
      check("createTopic", error);
      if (!data) throw new Error("pipeline-store: createTopic sem retorno");
      return data;
    },
  };
}
