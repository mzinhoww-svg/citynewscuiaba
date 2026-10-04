import "server-only";
import { z } from "zod";
import type {
  ClusterRepo,
  EventSink,
  FlagKey,
  Flags,
  IngestRepo,
  MediaAssetRecord,
  MediaContext,
  MediaRepo,
  PublishRepo,
  RulesSource,
  RawPayload,
  RunStore,
  SourcePatch,
  SourceRecord,
  SourceReliability,
  UnderstandRepo,
  DecisionRecord,
} from "@/lib/pipeline/ports";
import type { StepName } from "@/lib/pipeline/types";
import { toSigned64, toUnsigned64 } from "@/lib/pipeline/simhash";
import { RawEntrySchema } from "@/lib/pipeline/types";
import { vectorLiteral } from "@/lib/pipeline/vector";
import { err } from "@/lib/result";
import { parseRuleRow } from "@/lib/rules/load";
import type { StatusReason } from "@/lib/sources/types";
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

/** `stats.fetch_enqueued` gravado = os fetch da janela já foram enfileirados. */
function hasFetchEnqueued(stats: Json | undefined): boolean {
  return typeof stats === "object" && stats !== null && !Array.isArray(stats)
    ? "fetch_enqueued" in stats
    : false;
}

/** Padrão de `app_settings` quando a chave some ou sai da grade (a grade vale no banco também). */
const FALLBACK_DEFAULT_FREQUENCY = 30;
const FALLBACK_FAST_LANE_MAX = 10;

/** `consumption.robots.crawlDelaySec` (§6.2), ou `null` se ausente ou ilegível. */
export function crawlDelayOf(consumption: Json | undefined): number | null {
  const parsed = z
    .object({ robots: z.object({ crawlDelaySec: z.number().nonnegative().nullable() }) })
    .safeParse(consumption);
  return parsed.success ? parsed.data.robots.crawlDelaySec : null;
}

/** `ingest_runs` e `sources` para os ticks (service role). */
export function createRunStore(db: DbClient): RunStore {
  const started = (op: string, data: { run_id: string; created: boolean; stats: Json } | null) => {
    if (!data) throw new Error(`pipeline-store: ${op} sem retorno`);
    return {
      runId: data.run_id,
      created: data.created,
      fetchEnqueued: hasFetchEnqueued(data.stats),
    };
  };
  const setting = async (key: string, schema: z.ZodType<number>, fallback: number) => {
    const { data, error } = await db
      .from("app_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    check(`app_settings(${key})`, error);
    const parsed = schema.safeParse(data?.value);
    return parsed.success ? parsed.data : fallback;
  };
  const lastOf = async (trigger: "cron" | "fast") => {
    const { data, error } = await db
      .from("ingest_runs")
      .select("started_at")
      .eq("trigger", trigger)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    check(`lastStartedAt(${trigger})`, error);
    return data?.started_at ?? null;
  };

  return {
    async startRun(windowStart) {
      const { data, error } = await db
        .rpc("start_ingest_run", { p_window: windowStart.toISOString() })
        .single();
      check("startRun", error);
      return started("startRun", data);
    },

    async startFastRun(windowStart) {
      const { data, error } = await db
        .rpc("start_fast_run", { p_window: windowStart.toISOString() })
        .single();
      check("startFastRun", error);
      return started("startFastRun", data);
    },

    async startManualRun(sourceId) {
      const { data, error } = await db.rpc("start_manual_run", { p_source: sourceId }).single();
      check("startManualRun", error);
      return { runId: started("startManualRun", data).runId };
    },

    async markFetchEnqueued(runId, count, extra = {}) {
      // Uma instrução só (`mark_fetch_enqueued`): mescla o jsonb no banco e só marca se ainda não
      // estiver marcado, então o tick que perdeu a corrida não sobrescreve nada.
      const { data, error } = await db.rpc("mark_fetch_enqueued", {
        p_run: runId,
        p_count: count,
        p_extra: toJsonObject(extra),
      });
      check("markFetchEnqueued", error);
      return data === true;
    },

    async previousOpenRun(windowStart) {
      const { data, error } = await db
        .from("ingest_runs")
        .select("id")
        .eq("trigger", "cron")
        .eq("status", "running")
        .lt("window_start", windowStart.toISOString())
        .order("window_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("previousOpenRun", error);
      return data?.id ?? null;
    },

    lastStartedAt: () => lastOf("cron"),
    lastFastStartedAt: () => lastOf("fast"),

    defaultFrequency: () =>
      setting(
        "sources.default_frequency_minutes",
        z
          .number()
          .int()
          .min(30)
          .max(1440)
          .refine((v) => v % 30 === 0),
        FALLBACK_DEFAULT_FREQUENCY,
      ),

    fastLaneMax: () =>
      setting("sources.fast_lane_max", z.number().int().min(0).max(20), FALLBACK_FAST_LANE_MAX),

    async activeSources() {
      const { data, error } = await db
        .from("sources")
        .select(
          "id, slug, status, priority, editorial_score, frequency_minutes, terms_min_interval_minutes, rate_limit_per_hour, consumption, last_fetched_at",
        )
        .in("status", ["active", "degraded"])
        .is("archived_at", null)
        .order("priority", { ascending: true })
        .order("editorial_score", { ascending: false })
        .order("slug", { ascending: true });
      check("activeSources", error);
      return (data ?? []).map((s) => ({
        id: s.id,
        slug: s.slug,
        status: s.status,
        priority: s.priority,
        editorialScore: s.editorial_score,
        // `null` = padrão global (D-F14): resolvido por `dueSources` com `defaultFrequency()`.
        frequencyMinutes: s.frequency_minutes,
        crawlDelaySec: crawlDelayOf(s.consumption),
        termsMinIntervalMinutes: s.terms_min_interval_minutes,
        rateLimitPerHour: s.rate_limit_per_hour,
        lastFetchedAt: s.last_fetched_at,
      }));
    },
  };
}

/** `peek_rate_limit`: consulta a cota de `crawler:<slug>` na hora sem consumir (tick rápido). */
export function createRateLimitPeek(db: DbClient) {
  return async (bucket: string, limitPerHour: number): Promise<boolean> => {
    const i = bucket.indexOf(":");
    const { data, error } = await db.rpc("peek_rate_limit", {
      p_bucket: i > 0 ? bucket.slice(0, i) : bucket,
      p_key_hash: i > 0 ? bucket.slice(i + 1) : "-",
      p_limit: limitPerHour,
      p_window_seconds: 3600,
    });
    check("peekRateLimit", error);
    return data === true;
  };
}

/** `peek_rate_limit` genérico (bucket, chave, limite, janela): consulta sem consumir. */
export function createRateLimitPeekKey(db: DbClient) {
  return async (bucket: string, key: string, limit: number, windowSec: number) => {
    const { data, error } = await db.rpc("peek_rate_limit", {
      p_bucket: bucket,
      p_key_hash: key,
      p_limit: limit,
      p_window_seconds: windowSec,
    });
    check("peekRateLimit", error);
    return data === true;
  };
}

/** `hit_rate_limit` genérico (bucket, chave, limite, janela): "Coletar agora" e afins. */
export function createRateLimitHit(db: DbClient) {
  return async (bucket: string, key: string, limit: number, windowSec: number) => {
    const { data, error } = await db.rpc("hit_rate_limit", {
      p_bucket: bucket,
      p_key_hash: key,
      p_limit: limit,
      p_window_seconds: windowSec,
    });
    check("hitRateLimit", error);
    return data === true;
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
  etag: z.string().nullable().optional(),
  lastModified: z.string().nullable().optional(),
  truncated: z.boolean().optional(),
});
const EntriesSchema = z.array(RawEntrySchema).nullable();

const SOURCE_COLUMNS =
  "id, slug, name, base_url, kind, feed_url, status, status_reason, consecutive_failures, rate_limit_per_hour, locality, etag, last_modified, consumption";

const STATUS_REASONS = [
  "pending_activation",
  "manual",
  "auto_failures",
  "robots",
  "opt_out",
  "legal",
  "quality",
  "other",
] as const;
const toStatusReason = (v: string | null): StatusReason | null =>
  (STATUS_REASONS as readonly string[]).includes(v ?? "") ? (v as StatusReason) : null;

interface SourceRow {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  kind: SourceRecord["kind"];
  feed_url: string | null;
  status: SourceRecord["status"];
  status_reason: string | null;
  consecutive_failures: number;
  rate_limit_per_hour: number;
  locality: string;
  etag: string | null;
  last_modified: string | null;
  consumption: Json;
}

const toSource = (r: SourceRow): SourceRecord => ({
  id: r.id,
  slug: r.slug,
  name: r.name,
  baseUrl: r.base_url,
  kind: r.kind,
  feedUrl: r.feed_url,
  status: r.status,
  statusReason: toStatusReason(r.status_reason),
  consecutiveFailures: r.consecutive_failures,
  rateLimitPerHour: r.rate_limit_per_hour,
  locality: r.locality,
  etag: r.etag,
  lastModified: r.last_modified,
  consumption: r.consumption,
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

    async runTrigger(runId) {
      const { data, error } = await db
        .from("ingest_runs")
        .select("trigger")
        .eq("id", runId)
        .maybeSingle();
      check("runTrigger", error);
      const t = data?.trigger;
      return t === "cron" || t === "fast" || t === "manual" ? t : null;
    },

    async claimFetch(sourceId, runId, since) {
      const { data, error } = await db.rpc("claim_source_fetch", {
        p_source: sourceId,
        p_run: runId,
        p_since: since.toISOString(),
      });
      check("claimFetch", error);
      return data === true;
    },

    async recordFetchOnce(sourceId, runId, outcome, latencyMs, fetchError) {
      const { data, error } = await db.rpc("record_source_fetch_once", {
        p_source: sourceId,
        p_run: runId,
        p_outcome: outcome,
        // Parâmetros opcionais (`default null` em 0030): ausente = sem amostra ou sem erro.
        ...(latencyMs !== null ? { p_latency_ms: latencyMs } : {}),
        ...(fetchError !== null ? { p_error: fetchError.slice(0, 2000) } : {}),
      });
      check("recordFetchOnce", error);
      return data === true;
    },

    async recordFetch(sourceId, outcome, latencyMs, itemsNew, fetchError) {
      const { error } = await db.rpc("record_source_fetch", {
        p_source: sourceId,
        p_outcome: outcome,
        p_items_new: itemsNew,
        ...(latencyMs !== null ? { p_latency_ms: latencyMs } : {}),
        ...(fetchError !== null ? { p_error: fetchError.slice(0, 2000) } : {}),
      });
      check("recordFetch", error);
    },

    async applySourceState(id, patch) {
      const row = {
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.statusReason !== undefined ? { status_reason: patch.statusReason } : {}),
        ...(patch.consecutiveFailures !== undefined
          ? { consecutive_failures: patch.consecutiveFailures }
          : {}),
      };
      if (Object.keys(row).length === 0) return;
      // Só fonte ainda coletável: uma pausa, bloqueio ou arquivamento humano no meio da coleta
      // vence (o pipeline nunca reativa o que uma pessoa parou).
      const { error } = await db
        .from("sources")
        .update(row)
        .eq("id", id)
        .in("status", ["active", "degraded"])
        .is("archived_at", null);
      check("applySourceState", error);
    },

    async notifyOnce(n, windowSec) {
      const { data, error } = await db.rpc("notify_once", {
        p: toJson(n),
        p_window_sec: windowSec,
      });
      check("notifyOnce", error);
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
      if (created) return { id: created, created: true, pending: true };
      const { data, error } = await db
        .from("collected_items")
        .select("id, duplicate_of, quarantined_at, relevance")
        .eq("canonical_url", item.canonicalUrl)
        .single();
      check("insertCollectedItem(existing)", error);
      if (!data) throw new Error("pipeline-store: collected_item sumiu");
      // Ainda não classificado (nem duplicado, nem em quarentena): a retomada o manda seguir.
      const pending =
        data.duplicate_of === null && data.quarantined_at === null && data.relevance === null;
      return { id: data.id, created: false, pending };
    },

    async collectedForEnrich(id) {
      const { data, error } = await db
        .from("collected_items")
        .select("id, source_id, canonical_url, original_title, excerpt, published_at, image_url")
        .eq("id", id)
        .maybeSingle();
      check("collectedForEnrich", error);
      if (!data) return null;
      return {
        id: data.id,
        sourceId: data.source_id,
        canonicalUrl: data.canonical_url,
        originalTitle: data.original_title,
        excerpt: data.excerpt,
        publishedAt: data.published_at,
        imageUrl: data.image_url,
      };
    },

    async applyEnrichment(id, patch) {
      const update = {
        ...(patch.originalTitle !== undefined ? { original_title: patch.originalTitle } : {}),
        ...(patch.excerpt !== undefined ? { excerpt: patch.excerpt } : {}),
        ...(patch.sourceText !== undefined ? { source_text: patch.sourceText } : {}),
        ...(patch.publishedAt !== undefined ? { published_at: patch.publishedAt } : {}),
        ...(patch.imageUrl !== undefined ? { image_url: patch.imageUrl } : {}),
      };
      if (Object.keys(update).length === 0) return;
      const { error } = await db.from("collected_items").update(update).eq("id", id);
      check("applyEnrichment", error);
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

const RELIABILITIES = ["primary", "verified", "standard", "low"] as const;
const toReliability = (v: string | null | undefined): SourceReliability =>
  RELIABILITIES.find((r) => r === v) ?? "low";

const ITEM_WITH_SOURCE =
  "id, source_id, original_title, excerpt, summary, published_at, topic_id, duplicate_of, quarantined_at, section_slug, sources(slug, reliability, trusted, locality, republish_policy)";

interface ItemWithSourceRow {
  id: string;
  source_id: string;
  original_title: string;
  excerpt: string | null;
  summary: string | null;
  published_at: string | null;
  topic_id: string | null;
  duplicate_of: string | null;
  quarantined_at: string | null;
  section_slug: string | null;
  sources: {
    slug: string;
    reliability: string;
    trusted?: boolean | null;
    locality: string;
    republish_policy: string;
  } | null;
}

const DecisionOutputSchema = z.record(z.string(), z.unknown());

const DECISION_COLUMNS =
  "object_ref, step, agent_id, prompt_version, input_hash, output, rationale, rules_version, recommended, human_decision, human_id";

interface DecisionRow {
  object_ref: string;
  agent_id: string | null;
  prompt_version: number | null;
  input_hash: string | null;
  output: Json | null;
  rationale: string | null;
  rules_version: number | null;
  recommended: string | null;
  human_decision: string | null;
  human_id: string | null;
}

function toDecision(r: DecisionRow, step: StepName): DecisionRecord {
  const output = DecisionOutputSchema.safeParse(r.output);
  return {
    objectRef: r.object_ref,
    step,
    agentId: r.agent_id,
    promptVersion: r.prompt_version,
    inputHash: r.input_hash ?? "",
    output: output.success ? output.data : {},
    rationale: r.rationale,
    rulesVersion: r.rules_version,
    recommended: r.recommended,
    humanDecision: r.human_decision,
    humanId: r.human_id,
  };
}

/** Banco das etapas classify, locate e verify (service role). */
export function createUnderstandRepo(db: DbClient): UnderstandRepo {
  return {
    async understandItem(id) {
      const { data, error } = await db
        .from("collected_items")
        .select(ITEM_WITH_SOURCE)
        .eq("id", id)
        .maybeSingle<ItemWithSourceRow>();
      check("understandItem", error);
      if (!data) return null;
      return {
        id: data.id,
        sourceId: data.source_id,
        sourceSlug: data.sources?.slug ?? "",
        reliability: toReliability(data.sources?.reliability),
        sourceLocality: data.sources?.locality ?? "cuiaba",
        republishPolicy:
          data.sources?.republish_policy === "summary_2_sentences"
            ? "summary_2_sentences"
            : "link_only",
        title: data.original_title,
        excerpt: data.excerpt,
        summary: data.summary,
        publishedAt: data.published_at,
        topicId: data.topic_id,
        duplicateOf: data.duplicate_of,
        quarantined: data.quarantined_at !== null,
      };
    },

    async updateItem(id, patch) {
      const row = {
        ...(patch.sectionSlug !== undefined ? { section_slug: patch.sectionSlug } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags.slice(0, 8) } : {}),
        ...(patch.relevance !== undefined ? { relevance: patch.relevance } : {}),
        ...(patch.sensitive !== undefined ? { sensitive: patch.sensitive } : {}),
        ...(patch.locality !== undefined ? { locality: patch.locality } : {}),
        ...(patch.neighborhood !== undefined ? { neighborhood: patch.neighborhood } : {}),
      };
      if (Object.keys(row).length === 0) return;
      const { error } = await db.from("collected_items").update(row).eq("id", id);
      check("updateItem", error);
    },

    async quarantineItem(id, reason) {
      const { error } = await db
        .from("collected_items")
        .update({
          quarantined_at: new Date().toISOString(),
          quarantine_reason: reason.slice(0, 500),
        })
        .eq("id", id);
      check("quarantineItem", error);
    },

    async saveItemSummary(id, summary) {
      const { error } = await db.from("collected_items").update({ summary }).eq("id", id);
      check("saveItemSummary", error);
    },

    async findDecision(objectRef, step, hash) {
      const { data, error } = await db
        .from("decisions")
        .select(DECISION_COLUMNS)
        .eq("object_ref", objectRef)
        .eq("step", step)
        .eq("input_hash", hash)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("findDecision", error);
      if (!data) return null;
      return toDecision(data, step);
    },

    async recordDecision(d) {
      const { error } = await db.from("decisions").insert({
        object_ref: d.objectRef,
        step: d.step,
        agent_id: d.agentId,
        prompt_version: d.promptVersion,
        input_hash: d.inputHash,
        output: toJson(d.output),
        rationale: d.rationale,
        rules_version: d.rulesVersion ?? null,
        recommended: d.recommended ?? null,
        human_decision: d.humanDecision ?? null,
        human_id: d.humanId ?? null,
      });
      check("recordDecision", error);
    },

    async topicBundle(topicId) {
      const topic = await db
        .from("topics")
        .select("id, updated_at, state")
        .eq("id", topicId)
        .maybeSingle();
      check("topicBundle", topic.error);
      if (!topic.data) return null;
      const { data, error } = await db
        .from("collected_items")
        .select(ITEM_WITH_SOURCE)
        .eq("topic_id", topicId)
        .is("duplicate_of", null)
        .is("quarantined_at", null)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .returns<ItemWithSourceRow[]>();
      check("topicBundle(items)", error);
      return {
        topicId,
        updatedAt: topic.data.updated_at,
        state: topic.data.state,
        items: (data ?? []).map((r) => ({
          id: r.id,
          sourceId: r.source_id,
          sourceSlug: r.sources?.slug ?? "",
          reliability: toReliability(r.sources?.reliability),
          trusted: r.sources?.trusted ?? undefined,
          title: r.original_title,
          excerpt: r.excerpt,
          publishedAt: r.published_at,
          sectionSlug: r.section_slug,
        })),
      };
    },

    async updateTopic(topicId, patch) {
      const { error } = await db
        .from("topics")
        .update({
          confidence: patch.confidence,
          confidence_score: patch.confidenceScore,
          ...(patch.state ? { state: patch.state } : {}),
        })
        .eq("id", topicId);
      check("updateTopic", error);
      if (patch.sectionSlug) {
        const s = await db
          .from("topics")
          .update({ section_slug: patch.sectionSlug })
          .eq("id", topicId)
          .is("section_slug", null);
        check("updateTopic(section)", s.error);
      }
    },
  };
}

/** `feature_flags` com falha fechada: ausente ou erro = desligada. */
export function createFlags(db: DbClient): Flags {
  return {
    async isEnabled(key: FlagKey) {
      const { data, error } = await db
        .from("feature_flags")
        .select("enabled")
        .eq("key", key)
        .maybeSingle();
      return !error && data?.enabled === true;
    },
  };
}

const MediaSlotSchema = z
  .object({
    mediaId: z.string(),
    sourceId: z.string().nullable(),
    originUrl: z.string().nullable(),
    kind: z.enum(["original", "reproduction", "licensed", "illustrative", "ai_generated"]),
    status: z.enum(["pending", "approved", "blocked"]),
    phash: z.string().nullable(),
  })
  .transform((s) => ({
    ...s,
    // dHash trafega como texto com sinal (bigint do Postgres); volta a 64 bits sem sinal.
    phash: s.phash === null ? null : BigInt.asUintN(64, BigInt(s.phash)),
  }));

const MediaContextSchema = z.object({
  articleId: z.string(),
  topicId: z.string().nullable(),
  title: z.string(),
  sectionSlug: z.string(),
  category: z.string(),
  sensitive: z.boolean(),
  tags: z.array(z.string()),
  hasMedia: z.boolean(),
  cover: MediaSlotSchema.nullable(),
  inline: MediaSlotSchema.nullable(),
  bodyParagraphs: z.number(),
  humanMedia: z.boolean(),
  humanEdited: z.boolean(),
  items: z.array(
    z.object({
      itemId: z.string(),
      title: z.string(),
      imageUrl: z.string().nullable(),
      pageUrl: z.string(),
      author: z.string().nullable(),
      source: z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        baseUrl: z.string(),
        imagePolicy: z.enum(["none", "with_agreement", "licensed_only", "reproduction"]),
        agreementUntil: z.string().nullable(),
        rateLimitPerHour: z.number(),
      }),
    }),
  ),
});

const ASSET_COLUMNS =
  "id, kind, storage_path, origin_url, status, width, height, credit, source_id, tags";

interface AssetRow {
  id: string;
  kind: MediaAssetRecord["kind"];
  storage_path: string;
  origin_url: string | null;
  status: string;
  width: number | null;
  height: number | null;
  credit: string | null;
  source_id: string | null;
  tags: string[];
}

const toAsset = (r: AssetRow): MediaAssetRecord => ({
  id: r.id,
  kind: r.kind,
  storagePath: r.storage_path,
  originUrl: r.origin_url,
  status: r.status === "approved" || r.status === "blocked" ? r.status : "pending",
  width: r.width,
  height: r.height,
  credit: r.credit,
  sourceId: r.source_id,
  tags: r.tags ?? [],
});

/** Banco da etapa de imagem e da remoção de reproduções (service role). */
export function createMediaRepo(db: DbClient): MediaRepo {
  const ingest = createIngestRepo(db);
  return {
    hitRateLimit: (bucket, limit) => ingest.hitRateLimit(bucket, limit),

    async mediaContext(articleId): Promise<MediaContext | null> {
      const { data, error } = await db.rpc("pipeline_media_context", { p_article: articleId });
      check("mediaContext", error);
      if (data === null || data === undefined) return null;
      const parsed = MediaContextSchema.safeParse(data);
      if (!parsed.success) throw new Error(`pipeline-store: mediaContext: ${parsed.error.message}`);
      return parsed.data;
    },

    async assetByOrigin(originUrl) {
      const { data, error } = await db
        .from("media_assets")
        .select(ASSET_COLUMNS)
        .eq("origin_url", originUrl)
        .order("captured_at", { ascending: true })
        .limit(20)
        .returns<AssetRow[]>();
      check("assetByOrigin", error);
      const rows = (data ?? []).map(toAsset);
      // Removida a pedido vence: a mesma origem nunca volta a ser usada.
      return rows.find((r) => r.status === "blocked") ?? rows[0] ?? null;
    },

    async phashNeighbors(phash, maxDistance, excludeOrigin) {
      const { data, error } = await db.rpc("media_phash_neighbors", {
        p_phash: toSigned64(phash).toString(),
        p_max: maxDistance,
        p_exclude: excludeOrigin,
      });
      check("phashNeighbors", error);
      return (data ?? []).map((r) => r.distance);
    },

    async archiveCandidates(tags, limit) {
      if (tags.length === 0) return [];
      const { data, error } = await db
        .from("media_assets")
        .select(ASSET_COLUMNS)
        .eq("kind", "illustrative")
        .eq("status", "approved")
        .overlaps("tags", tags)
        .order("captured_at", { ascending: false })
        .limit(limit)
        .returns<AssetRow[]>();
      check("archiveCandidates", error);
      return (data ?? []).map(toAsset);
    },

    async insertAsset(a) {
      const { data, error } = await db.rpc("media_insert_asset", {
        p: toJson({ ...a, phash: toSigned64(a.phash).toString() }),
      });
      check("insertAsset", error);
      if (!data) throw new Error("pipeline-store: insertAsset sem retorno");
      return data;
    },

    async linkArticleMedia(articleId, mediaId, rationale, chosenBy, slot) {
      const role = slot?.role ?? "cover";
      // Um papel por matéria (índices únicos parciais): o que já está lá não é trocado.
      const taken = await db
        .from("article_media")
        .select("media_id")
        .eq("article_id", articleId)
        .eq("role", role)
        .maybeSingle();
      check("linkArticleMedia(role)", taken.error);
      if (taken.data) return;
      const { error } = await db.from("article_media").upsert(
        {
          article_id: articleId,
          media_id: mediaId,
          rationale,
          chosen_by: chosenBy,
          role,
          position: role === "inline" ? (slot?.position ?? null) : null,
        },
        { onConflict: "article_id,media_id", ignoreDuplicates: true },
      );
      // Corrida entre dois workers: o índice único do papel já está ocupado. Não é erro.
      if (error && (error as { code?: string }).code === "23505") return;
      check("linkArticleMedia", error);
    },

    async recordDecision(d) {
      await createUnderstandRepo(db).recordDecision(d);
    },

    async asset(id) {
      const { data, error } = await db
        .from("media_assets")
        .select(ASSET_COLUMNS)
        .eq("id", id)
        .maybeSingle<AssetRow>();
      check("asset", error);
      return data ? toAsset(data) : null;
    },

    async reproductionsOfSource(sourceId) {
      const { data, error } = await db
        .from("media_assets")
        .select(ASSET_COLUMNS)
        .eq("kind", "reproduction")
        .eq("source_id", sourceId)
        .neq("status", "blocked")
        .returns<AssetRow[]>();
      check("reproductionsOfSource", error);
      return (data ?? []).map(toAsset);
    },

    async blockAsset(id, reason, at) {
      const { error } = await db
        .from("media_assets")
        .update({
          status: "blocked",
          removed_at: at.toISOString(),
          removal_reason: reason.slice(0, 500),
        })
        .eq("id", id);
      check("blockAsset", error);
      const links = await db.from("article_media").select("article_id").eq("media_id", id);
      check("blockAsset(links)", links.error);
      return { articleIds: (links.data ?? []).map((l) => l.article_id) };
    },

    async audit(entry) {
      const { error } = await db.from("audit_log").insert({
        actor: entry.actor,
        action: entry.action,
        object_ref: entry.objectRef,
        details: toJsonObject(entry.details),
      });
      check("audit", error);
    },
  };
}

/** Regras ativas (`rules.active`). Nenhuma, várias ou corpo inválido = erro (falha fechada). */
export function createRulesSource(db: DbClient): RulesSource {
  return {
    async activeRules() {
      const { data, error } = await db
        .from("rules")
        .select("version, body, force_review")
        .eq("active", true)
        .order("version", { ascending: false })
        .limit(2);
      if (error) return err(`erro ao carregar regras: ${error.message}`);
      if (!data || data.length === 0) return err("nenhuma regra ativa");
      if (data.length > 1)
        return err(`mais de uma versão ativa (${data.map((r) => r.version).join(", ")})`);
      return parseRuleRow(data[0]!);
    },
  };
}

const STATUSES = [
  "draft",
  "in_review",
  "changes_requested",
  "approved",
  "scheduled",
  "published",
  "updated",
  "archived",
  "unpublished",
] as const;
const LEVELS = ["alta", "média", "baixa"] as const;

const DraftContextSchema = z.object({
  topic: z.object({
    id: z.string(),
    slug: z.string(),
    title: z.string(),
    sectionSlug: z.string().nullable(),
    confidence: z.enum(LEVELS),
    confidenceScore: z.coerce.number(),
  }),
  items: z.array(
    z.object({
      id: z.string(),
      sourceId: z.string(),
      sourceSlug: z.string(),
      sourceName: z.string(),
      reliability: z.enum(RELIABILITIES),
      title: z.string(),
      excerpt: z.string().nullable(),
      sourceText: z.string().nullable().optional(),
      publishedAt: z.string().nullable(),
      sectionSlug: z.string().nullable(),
      canonicalUrl: z.string(),
      tags: z.array(z.string()),
      sensitive: z.boolean(),
    }),
  ),
  verify: z
    .object({
      roles: z.array(z.object({ id: z.string(), role: z.string() })).optional(),
      centralConflict: z.boolean().optional(),
    })
    .passthrough()
    .nullable(),
  article: z
    .object({
      id: z.string(),
      status: z.enum(STATUSES),
      publishMode: z.enum(["human", "auto"]).nullable(),
      humanEdited: z.boolean(),
      version: z.number(),
    })
    .nullable(),
});

const DecisionContextSchema = z.object({
  articleId: z.string(),
  slug: z.string(),
  topicId: z.string().nullable(),
  status: z.enum(STATUSES),
  publishMode: z.enum(["human", "auto"]).nullable(),
  sectionSlug: z.string(),
  category: z.string(),
  title: z.string(),
  urgent: z.boolean(),
  aiFallback: z.boolean(),
  confidence: z.enum(LEVELS),
  confidenceScore: z.coerce.number(),
  version: z.number(),
  humanEdited: z.boolean(),
  independentSources: z.number(),
  primarySources: z.number(),
  tags: z.array(z.string()),
  sensitive: z.boolean(),
  centralConflict: z.boolean(),
  imageApproved: z.boolean(),
  // Campos da migration 0074; ausentes (banco antigo) valem como falso.
  dubious: z.boolean().default(false),
  sourceTrusted: z.boolean().default(false),
  // Campos da migration 0072; ausentes (banco antigo) valem como vazios.
  neighborhoods: z.array(z.string()).default([]),
  municipalities: z.array(z.string()).default([]),
  sourceLocalities: z.array(z.string()).default([]),
  nationalCommotion: z.boolean().default(false),
});

/** Banco das etapas 11 a 20 e da despublicação (service role). */
export function createPublishRepo(db: DbClient): PublishRepo {
  const understand = createUnderstandRepo(db);
  return {
    async draftContext(topicId) {
      const { data, error } = await db.rpc("pipeline_draft_context", { p_topic: topicId });
      check("draftContext", error);
      if (data === null || data === undefined) return null;
      const parsed = DraftContextSchema.safeParse(data);
      if (!parsed.success) throw new Error(`pipeline-store: draftContext: ${parsed.error.message}`);
      return parsed.data;
    },

    async saveDraft(d) {
      const { data, error } = await db.rpc("save_pipeline_draft", { p: toJson(d) }).single();
      check("saveDraft", error);
      if (!data) throw new Error("pipeline-store: saveDraft sem retorno");
      return { articleId: data.article_id, version: data.version };
    },

    async decisionContext(articleId) {
      const { data, error } = await db.rpc("pipeline_decision_context", { p_article: articleId });
      check("decisionContext", error);
      if (data === null || data === undefined) return null;
      const parsed = DecisionContextSchema.safeParse(data);
      if (!parsed.success)
        throw new Error(`pipeline-store: decisionContext: ${parsed.error.message}`);
      return parsed.data;
    },

    async checkInput(articleId) {
      const [art, sources, cover, imageDecision] = await Promise.all([
        db
          .from("articles")
          .select(
            "title, dek, body, seo_title, seo_description, tags, neighborhoods, section_slug, short_reason",
          )
          .eq("id", articleId)
          .maybeSingle(),
        db
          .from("article_sources")
          .select("*", { count: "exact", head: true })
          .eq("article_id", articleId),
        db
          .from("article_media")
          .select("alt, media_assets(status)")
          .eq("article_id", articleId)
          .eq("role", "cover")
          .limit(1)
          .maybeSingle<{ alt: string | null; media_assets: { status: string } | null }>(),
        db
          .from("decisions")
          .select("*", { count: "exact", head: true })
          .eq("object_ref", `article:${articleId}`)
          .eq("step", "image"),
      ]);
      check("checkInput(article)", art.error);
      check("checkInput(sources)", sources.error);
      check("checkInput(cover)", cover.error);
      check("checkInput(image)", imageDecision.error);
      if (!art.data) return null;
      const hasPhoto = cover.data !== null && cover.data.media_assets?.status !== "blocked";
      return {
        title: art.data.title,
        dek: art.data.dek,
        body: art.data.body,
        seoTitle: art.data.seo_title,
        seoDescription: art.data.seo_description,
        tags: art.data.tags ?? [],
        neighborhoods: art.data.neighborhoods ?? [],
        sectionSlug: art.data.section_slug,
        sourceCount: sources.count ?? 0,
        cover: hasPhoto ? "photo" : (imageDecision.count ?? 0) > 0 ? "typographic" : "pending",
        coverAlt: hasPhoto ? (cover.data?.alt ?? null) : null,
        shortReason: art.data.short_reason === "insufficient_source" ? "insufficient_source" : null,
      };
    },

    async applyChecklist(articleId, patch) {
      const fields = {
        ...(patch.seoTitle !== undefined ? { seo_title: patch.seoTitle } : {}),
        ...(patch.seoDescription !== undefined ? { seo_description: patch.seoDescription } : {}),
        ...(patch.tags !== undefined ? { tags: patch.tags } : {}),
        ...(patch.neighborhoods !== undefined ? { neighborhoods: patch.neighborhoods } : {}),
      };
      if (Object.keys(fields).length > 0) {
        const { error } = await db.from("articles").update(fields).eq("id", articleId);
        check("applyChecklist(articles)", error);
      }
      if (patch.coverAlt !== undefined) {
        const { error } = await db
          .from("article_media")
          .update({ alt: patch.coverAlt })
          .eq("article_id", articleId)
          .eq("role", "cover");
        check("applyChecklist(alt)", error);
      }
    },

    async setStatus(articleId, p) {
      const { error } = await db
        .from("articles")
        .update({
          status: p.status,
          updated_at: new Date().toISOString(),
          ...(p.publishMode !== undefined ? { publish_mode: p.publishMode } : {}),
          ...(p.publishedAt !== undefined ? { published_at: p.publishedAt } : {}),
          ...(p.rulesVersion !== undefined ? { rules_version: p.rulesVersion } : {}),
          ...(p.reviewReason !== undefined ? { review_reason: p.reviewReason } : {}),
          ...(p.newsScope !== undefined ? { news_scope: p.newsScope } : {}),
          ...(p.nationalCommotion !== undefined ? { national_commotion: p.nationalCommotion } : {}),
          ...(p.urgent !== undefined ? { urgent: p.urgent } : {}),
          ...(p.shortReason !== undefined ? { short_reason: p.shortReason } : {}),
        })
        .eq("id", articleId);
      check("setStatus", error);
    },

    async articleText(articleId) {
      const { data, error } = await db
        .from("articles")
        .select("title, dek, body")
        .eq("id", articleId)
        .maybeSingle();
      check("articleText", error);
      if (!data) return null;
      const texts: string[] = [];
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (typeof n === "object" && n !== null) {
          const o = n as Record<string, unknown>;
          if (typeof o.text === "string") texts.push(o.text);
          if (o.content !== undefined) walk(o.content);
        }
      };
      walk(data.body);
      return [data.title, data.dek, ...texts].join("\n");
    },

    async indexArticle(articleId, embedding) {
      const { error } = await db.rpc("index_article", {
        p_id: articleId,
        ...(embedding ? { p_embedding: vectorLiteral(embedding) } : {}),
      });
      check("indexArticle", error);
    },

    findDecision: (objectRef, step, hash) => understand.findDecision(objectRef, step, hash),

    async latestDecision(objectRef, step) {
      const { data, error } = await db
        .from("decisions")
        .select(DECISION_COLUMNS)
        .eq("object_ref", objectRef)
        .eq("step", step)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("latestDecision", error);
      return data ? toDecision(data, step) : null;
    },

    recordDecision: (d) => understand.recordDecision(d),

    async notifyOnce(n, windowSec) {
      const { data, error } = await db.rpc("notify_once", {
        p: toJson(n),
        p_window_sec: windowSec,
      });
      check("notifyOnce", error);
      return data === true;
    },

    async audit(entry) {
      const { error } = await db.from("audit_log").insert({
        actor: entry.actor,
        action: entry.action,
        object_ref: entry.objectRef,
        details: toJsonObject(entry.details),
      });
      check("audit", error);
    },
  };
}
