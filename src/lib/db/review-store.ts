import "server-only";
import {
  DEFAULT_REVIEWER_MODE,
  isReviewerMode,
  type ReviewRepo,
} from "@/lib/pipeline/steps/auto-reviewer";
import type { DbClient } from "./client";
import { createPublishRepo } from "./pipeline-store";

/**
 * Banco do revisor automático (service role): o `PublishRepo` das etapas de publicação mais o
 * modo (`ai_reviewer_settings`), a fila vencida (`review_due_articles`, 0141) e o que impede o
 * revisor de decidir (denúncia, correção, direito de resposta, escalada).
 */
export function createReviewRepo(db: DbClient): ReviewRepo {
  const base = createPublishRepo(db);
  return {
    ...base,

    async mode() {
      const { data, error } = await db
        .from("ai_reviewer_settings")
        .select("mode")
        .eq("id", true)
        .maybeSingle();
      // Falha fechada: sem leitura do modo, o revisor não decide.
      if (error) return "off";
      return isReviewerMode(data?.mode) ? data.mode : DEFAULT_REVIEWER_MODE;
    },

    async dueArticles(now, limit) {
      const { data, error } = await db.rpc("review_due_articles", {
        p_now: now.toISOString(),
        p_limit: limit,
      });
      if (error) throw new Error(`review-store: dueArticles: ${error.message}`);
      return (data ?? []).map((r) => r.id);
    },

    async reviewMeta(articleId) {
      const ref = `article:${articleId}`;
      const head = { count: "exact" as const, head: true };
      const [art, reports, corrections, escalations, sources] = await Promise.all([
        db
          .from("articles")
          .select("review_reason, due_at, agent_id")
          .eq("id", articleId)
          .maybeSingle(),
        db.from("reports").select("id", head).eq("content_ref", ref).eq("status", "open"),
        db
          .from("corrections")
          .select("id", head)
          .eq("article_id", articleId)
          .is("published_at", null)
          .eq("status", "open"),
        db
          .from("review_escalations")
          .select("id", head)
          .eq("article_id", articleId)
          .eq("status", "open"),
        db.from("article_sources").select("item_id").eq("article_id", articleId),
      ]);
      for (const r of [art, reports, corrections, escalations, sources])
        if (r.error) throw new Error(`review-store: reviewMeta: ${r.error.message}`);
      if (!art.data) return null;

      const itemIds = (sources.data ?? []).map((s) => s.item_id);
      const names = itemIds.length
        ? await db
            .from("collected_items")
            .select("sources(name)")
            .in("id", itemIds)
            .returns<{ sources: { name: string } | null }[]>()
        : { data: [] as { sources: { name: string } | null }[], error: null };
      if (names.error) throw new Error(`review-store: reviewMeta: ${names.error.message}`);

      return {
        reviewReason: art.data.review_reason,
        dueAt: art.data.due_at,
        fromPipeline: art.data.agent_id !== null,
        openReports: reports.count ?? 0,
        openCorrections: corrections.count ?? 0,
        openEscalations: escalations.count ?? 0,
        sourceNames: [
          ...new Set((names.data ?? []).flatMap((n) => (n.sources ? [n.sources.name] : []))),
        ],
      };
    },
  };
}
