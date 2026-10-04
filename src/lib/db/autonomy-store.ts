import "server-only";
import type { AutonomySweepPort } from "@/lib/pipeline/autonomy-sweep";
import { pipelineQueue } from "@/lib/pipeline/queue";
import { retryQuarantined } from "@/lib/pipeline/reprocess";
import { queueFor } from "@/lib/pipeline/types";
import type { DbClient } from "./client";
import { createReprocessRepo } from "./control-store";

const check = (what: string, error: { message: string } | null) => {
  if (error) throw new Error(`autonomia: ${what}: ${error.message}`);
};

/** Porta da varredura de autonomia (A-143) sobre o Supabase, com a service role. */
export function createAutonomySweepPort(db: DbClient): AutonomySweepPort {
  const queue = pipelineQueue();
  return {
    async breakerAutoRecover(now) {
      const { data, error } = await db.rpc("publish_breaker_auto_recover", {
        p_now: now.toISOString(),
      });
      check("disjuntor", error);
      return (data ?? {}) as Record<string, unknown>;
    },
    async dueArticles(now, limit) {
      const { data, error } = await db.rpc("autonomy_due_articles", {
        p_now: now.toISOString(),
        p_limit: limit,
      });
      check("matérias vencidas", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        topicId: r.topic_id,
        nextAction: r.next_action,
        aiFallback: r.ai_fallback,
        reprocessCount: r.reprocess_count,
      }));
    },
    async claimArticle(id) {
      const { error } = await db.rpc("autonomy_claim_article", { p_id: id });
      check("reserva", error);
    },
    async enqueue(msg) {
      return Boolean(await queue.enqueue(queueFor(msg.step), msg));
    },
    async openDeadLetters(limit) {
      const { data, error } = await db
        .from("pipeline_quarantine")
        .select("id, message, error, quarantined_at, reason_class, auto_retries, next_retry_at")
        .is("resolved_at", null)
        .order("quarantined_at", { ascending: false })
        .limit(limit);
      check("itens mortos", error);
      return (data ?? []).map((r) => ({
        id: r.id,
        step: String((r.message as { step?: unknown } | null)?.step ?? "desconhecida"),
        error: r.error,
        quarantinedAt: r.quarantined_at,
        reasonClass: r.reason_class,
        autoRetries: r.auto_retries,
        nextRetryAt: r.next_retry_at,
      }));
    },
    async classifyDeadLetter(id, c) {
      const { error } = await db
        .from("pipeline_quarantine")
        .update({
          reason_class: c.reasonClass,
          recommendation: c.recommendation,
          next_retry_at: c.nextRetryAt,
        })
        .eq("id", id);
      check("classificação", error);
    },
    async retryDeadLetters(ids) {
      const r = await retryQuarantined(
        { queue, repo: createReprocessRepo(db, { actorId: null }), now: () => new Date() },
        { ids, keepHumanDecisions: true },
      );
      return r.ok ? r.value.enqueued : 0;
    },
    async bumpDeadLetter(id, nextRetryAt) {
      const { data } = await db
        .from("pipeline_quarantine")
        .select("auto_retries")
        .eq("id", id)
        .maybeSingle();
      const { error } = await db
        .from("pipeline_quarantine")
        .update({ auto_retries: (data?.auto_retries ?? 0) + 1, next_retry_at: nextRetryAt })
        .eq("id", id);
      check("nova tentativa", error);
    },
    async upsertIncident(i) {
      const { data } = await db
        .from("pipeline_incidents")
        .select("id")
        .eq("signature", i.signature)
        .neq("status", "resolved")
        .maybeSingle();
      const row = {
        signature: i.signature,
        step: i.step,
        error_class: i.errorClass,
        count: i.count,
        last_seen: i.lastSeen,
        diagnosis: i.diagnosis,
        action: i.action,
      };
      const { error } = data
        ? await db.from("pipeline_incidents").update(row).eq("id", data.id)
        : await db.from("pipeline_incidents").insert({ ...row, first_seen: i.firstSeen });
      check("incidente", error);
    },
    async resolveIncidents(quietSince) {
      const { data, error } = await db
        .from("pipeline_incidents")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .neq("status", "resolved")
        .lt("last_seen", quietSince.toISOString())
        .select("id");
      check("incidentes resolvidos", error);
      return data?.length ?? 0;
    },
  };
}
