import "server-only";
import { parsePipelineMessage } from "@/lib/pipeline/types";
import type {
  QuarantinedMessage,
  RefLevel,
  ReprocessRepo,
  ReprocessScope,
} from "@/lib/pipeline/reprocess";
import type { RunNowRepo } from "@/lib/pipeline/run-now";
import type { DbClient } from "./client";
import type { Json } from "./types";

/*
 * Banco do reprocessamento e do "Executar agora" (service role: fila e quarentena só abrem para
 * o servidor). Chamado só depois da checagem de papel das ações do Control Center.
 */

function check(op: string, error: { message: string } | null): void {
  if (error) throw new Error(`control-store: ${op}: ${error.message}`);
}

const PRODUCTION_QUEUES = ["pipeline", "media", "notify"];
/** Escopo só por fonte olha os últimos 7 dias. */
const SOURCE_WINDOW_MS = 7 * 24 * 3_600_000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uniq = <T>(xs: readonly T[]) => [...new Set(xs)];

interface ItemRow {
  id: string;
  raw_id: string | null;
  source_id: string;
  topic_id: string | null;
}

export function createReprocessRepo(
  db: DbClient,
  opts: { actorId: string | null; now?: () => Date; queues?: string[] },
): ReprocessRepo {
  const now = opts.now ?? (() => new Date());
  const queues = opts.queues ?? PRODUCTION_QUEUES;

  async function runRawIds(runId: string, sourceId?: string): Promise<string[]> {
    let q = db.from("raw_items").select("id").eq("run_id", runId);
    if (sourceId) q = q.eq("source_id", sourceId);
    const { data, error } = await q.limit(2000);
    check("raw_items", error);
    return (data ?? []).map((r) => r.id);
  }

  async function items(scope: ReprocessScope, limit: number): Promise<ItemRow[]> {
    let q = db.from("collected_items").select("id, raw_id, source_id, topic_id");
    if (scope.itemIds?.length) q = q.in("id", scope.itemIds);
    if (scope.runId) {
      const raws = await runRawIds(scope.runId);
      if (raws.length === 0) return [];
      q = q.in("raw_id", raws);
    }
    if (scope.sourceId) q = q.eq("source_id", scope.sourceId);
    if (scope.sourceId && !scope.runId && !scope.itemIds?.length)
      q = q.gte("created_at", new Date(now().getTime() - SOURCE_WINDOW_MS).toISOString());
    const { data, error } = await q.order("created_at", { ascending: false }).limit(limit);
    check("collected_items", error);
    return data ?? [];
  }

  async function sourceSlugs(ids: string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const { data, error } = await db.from("sources").select("slug").in("id", uniq(ids));
    check("sources", error);
    return (data ?? []).map((s) => s.slug);
  }

  async function pipelineArticles(topicIds: string[]): Promise<{ id: string; topic_id: string }[]> {
    if (topicIds.length === 0) return [];
    const { data, error } = await db
      .from("articles")
      .select("id, topic_id")
      .in("topic_id", uniq(topicIds))
      .not("agent_id", "is", null);
    check("articles", error);
    return (data ?? []).flatMap((a) => (a.topic_id ? [{ id: a.id, topic_id: a.topic_id }] : []));
  }

  /** Matérias com decisão humana: registro em `decisions` ou versão escrita por pessoa. */
  async function humanArticles(ids: string[]): Promise<Set<string>> {
    if (ids.length === 0) return new Set();
    const refs = ids.map((id) => `article:${id}`);
    const [d, v] = await Promise.all([
      db
        .from("decisions")
        .select("object_ref")
        .in("object_ref", refs)
        .not("human_decision", "is", null),
      db.from("article_versions").select("article_id").in("article_id", ids).eq("origin", "human"),
    ]);
    check("decisions", d.error);
    check("article_versions", v.error);
    return new Set([
      ...(d.data ?? []).map((r) => r.object_ref.slice("article:".length)),
      ...(v.data ?? []).map((r) => r.article_id),
    ]);
  }

  return {
    async refsFor(scope, level: RefLevel, limit) {
      switch (level) {
        case "source": {
          if (scope.itemIds?.length) {
            const rows = await items(scope, limit);
            return (await sourceSlugs(rows.map((r) => r.source_id))).map((s) => `source:${s}`);
          }
          const slugs: string[] = [];
          if (scope.runId) {
            const { data, error } = await db
              .from("pipeline_events")
              .select("item_ref")
              .eq("run_id", scope.runId)
              .eq("step", "fetch")
              .like("item_ref", "source:%")
              .limit(2000);
            check("pipeline_events", error);
            slugs.push(...(data ?? []).map((e) => (e.item_ref ?? "").slice("source:".length)));
            const { data: raws, error: e2 } = await db
              .from("raw_items")
              .select("source_id")
              .eq("run_id", scope.runId)
              .limit(2000);
            check("raw_items", e2);
            slugs.push(...(await sourceSlugs((raws ?? []).map((r) => r.source_id))));
          }
          let out = uniq(slugs.filter(Boolean));
          if (scope.sourceId) {
            const [own] = await sourceSlugs([scope.sourceId]);
            out = scope.runId ? out.filter((s) => s === own) : own ? [own] : [];
          }
          return out.slice(0, limit).map((s) => `source:${s}`);
        }
        case "raw": {
          if (scope.itemIds?.length) {
            const rows = await items(scope, limit);
            return uniq(rows.flatMap((r) => (r.raw_id ? [`raw:${r.raw_id}`] : [])));
          }
          if (scope.runId)
            return (await runRawIds(scope.runId, scope.sourceId))
              .slice(0, limit)
              .map((id) => `raw:${id}`);
          const { data, error } = await db
            .from("raw_items")
            .select("id")
            .eq("source_id", scope.sourceId ?? "")
            .gte("fetched_at", new Date(now().getTime() - SOURCE_WINDOW_MS).toISOString())
            .limit(limit);
          check("raw_items", error);
          return (data ?? []).map((r) => `raw:${r.id}`);
        }
        case "item":
          return (await items(scope, limit)).map((r) => `item:${r.id}`);
        case "topic": {
          const rows = await items(scope, 2000);
          return uniq(rows.flatMap((r) => (r.topic_id ? [`topic:${r.topic_id}`] : []))).slice(
            0,
            limit,
          );
        }
        case "article": {
          const rows = await items(scope, 2000);
          const arts = await pipelineArticles(
            rows.flatMap((r) => (r.topic_id ? [r.topic_id] : [])),
          );
          return uniq(arts.map((a) => `article:${a.id}`)).slice(0, limit);
        }
      }
    },

    async humanDecided(refs) {
      const out = new Set<string>();
      // Referência malformada (sem uuid) nunca tem decisão humana e não vai ao banco.
      const byKind = (k: string) =>
        refs
          .filter((r) => r.startsWith(`${k}:`))
          .map((r) => r.slice(k.length + 1))
          .filter((id) => UUID.test(id));
      const articleIds = byKind("article");
      const topicIds = byKind("topic");
      const itemIds = byKind("item");

      const itemTopic = new Map<string, string>();
      if (itemIds.length > 0) {
        const { data, error } = await db
          .from("collected_items")
          .select("id, topic_id")
          .in("id", itemIds);
        check("collected_items", error);
        for (const r of data ?? []) if (r.topic_id) itemTopic.set(r.id, r.topic_id);
      }
      const arts = await pipelineArticles([...topicIds, ...itemTopic.values()]);
      const human = await humanArticles(uniq([...articleIds, ...arts.map((a) => a.id)]));
      const humanTopics = new Set(arts.filter((a) => human.has(a.id)).map((a) => a.topic_id));

      for (const id of articleIds) if (human.has(id)) out.add(`article:${id}`);
      for (const id of topicIds) if (humanTopics.has(id)) out.add(`topic:${id}`);
      for (const id of itemIds) {
        const t = itemTopic.get(id);
        if (t && humanTopics.has(t)) out.add(`item:${id}`);
      }
      return out;
    },

    async quarantined(ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("pipeline_quarantine")
        .select("id, message")
        .in("id", ids)
        .in("queue", queues)
        .is("resolved_at", null);
      check("pipeline_quarantine", error);
      const out: QuarantinedMessage[] = [];
      for (const r of data ?? []) {
        const parsed = parsePipelineMessage(r.message);
        if (parsed.ok) out.push({ id: r.id, message: parsed.value });
      }
      return out;
    },

    async resolveQuarantine(ids) {
      if (ids.length === 0) return 0;
      const { data, error } = await db
        .from("pipeline_quarantine")
        .update({ resolved_at: now().toISOString(), resolved_by: opts.actorId })
        .in("id", ids)
        .in("queue", queues)
        .is("resolved_at", null)
        .select("id");
      check("resolveQuarantine", error);
      return data?.length ?? 0;
    },
  };
}

export function createRunNowRepo(db: DbClient): RunNowRepo {
  return {
    async latestRunId() {
      const { data, error } = await db
        .from("ingest_runs")
        .select("id")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      check("latestRunId", error);
      return data?.id ?? null;
    },
    async createManualRun(windowStart, stats) {
      const { data, error } = await db
        .from("ingest_runs")
        .insert({
          window_start: windowStart.toISOString(),
          stats: JSON.parse(JSON.stringify(stats)) as NonNullable<Json>,
        })
        .select("id")
        .single();
      check("createManualRun", error);
      if (!data) throw new Error("control-store: createManualRun sem retorno");
      return data.id;
    },
    async activeSources() {
      const { data, error } = await db
        .from("sources")
        .select("id, slug")
        .eq("status", "active")
        .order("priority", { ascending: true })
        .order("slug", { ascending: true });
      check("activeSources", error);
      return data ?? [];
    },
    async source(id) {
      const { data, error } = await db
        .from("sources")
        .select("id, slug, status")
        .eq("id", id)
        .maybeSingle();
      check("source", error);
      return data;
    },
  };
}
