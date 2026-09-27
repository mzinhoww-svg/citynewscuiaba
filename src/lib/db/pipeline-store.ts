import "server-only";
import type { EventSink, RunStore } from "@/lib/pipeline/ports";
import type { DbClient } from "./client";
import type { Json } from "./types";

/** Serializa detalhes arbitrários como objeto JSON (descarta funções e valores não serializáveis). */
export function toJsonObject(value: Record<string, unknown> | undefined): { [key: string]: Json } {
  const parsed: unknown = JSON.parse(JSON.stringify(value ?? {}));
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? (parsed as { [key: string]: Json })
    : {};
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
