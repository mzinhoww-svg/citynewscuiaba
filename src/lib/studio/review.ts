import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { REVIEW_TEXT as T } from "@/content/pt-BR/studio";
import { studioAction, StudioFailure, type ActionContext } from "./action";
import { articleScope } from "./scope";

async function recordHumanDecision(
  ctx: ActionContext,
  id: string,
  decision: "approve" | "reject" | "request_changes" | "reprocess",
  rationale: string | null,
) {
  const { data: last } = await ctx.db
    .from("decisions")
    .select("rules_version, recommended")
    .eq("object_ref", `article:${id}`)
    .eq("step", "rules")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const at = ctx.now().toISOString();
  const { error } = await ctx.db.from("decisions").insert({
    object_ref: `article:${id}`,
    step: "review",
    rules_version: last?.rules_version ?? null,
    input_hash: createHash("sha256").update(`${decision}:${id}:${at}`).digest("hex"),
    output: { action: decision },
    rationale,
    recommended: last?.recommended ?? null,
    human_decision: decision,
    human_id: ctx.userId,
  });
  if (error) throw new Error(`decisão: ${error.message}`);
}

const Reasoned = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, T.reasonRequired).max(500),
});
type Reasoned = z.infer<typeof Reasoned>;

async function setStatus(
  ctx: ActionContext,
  id: string,
  status: "archived" | "changes_requested",
  reason: string,
) {
  const { data, error } = await ctx.db
    .from("articles")
    .update({ status, review_reason: reason, updated_at: ctx.now().toISOString() })
    .eq("id", id)
    .in("status", ["draft", "in_review", "changes_requested", "approved"])
    .select("id");
  if (error) throw new StudioFailure("forbidden");
  if (!data?.length) throw new StudioFailure("invalid", T.notReviewable);
}

/** Rejeitar item autônomo: sai da fila (arquivado, nunca público) com motivo e decisão humana. */
export const rejectItem = studioAction(
  "article.publish",
  (i: Reasoned, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    await setStatus(ctx, i.id, "archived", i.reason);
    await recordHumanDecision(ctx, i.id, "reject", i.reason);
    ctx.detail({ reason: i.reason });
    return { id: i.id, status: "archived" as const };
  },
  { schema: Reasoned, objectRef: (i) => `article:${i.id}`, auditAs: "article.reject" },
);

/** Pedir ajuste: volta para a redação com a orientação registrada. */
export const requestChanges = studioAction(
  "article.publish",
  (i: Reasoned, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    await setStatus(ctx, i.id, "changes_requested", i.reason);
    await recordHumanDecision(ctx, i.id, "request_changes", i.reason);
    ctx.detail({ reason: i.reason });
    return { id: i.id, status: "changes_requested" as const };
  },
  { schema: Reasoned, objectRef: (i) => `article:${i.id}`, auditAs: "article.request_changes" },
);

const Only = z.object({ id: z.uuid() });
type Only = z.infer<typeof Only>;

/** Reprocessar: devolve o assunto à etapa de redação do pipeline (sem edição humana). */
export const reprocessItem = studioAction(
  "article.edit",
  (i: Only, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const { error } = await ctx.db.rpc("studio_request_reprocess", { p_article: i.id });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      if (error.code === "22023") throw new StudioFailure("invalid", T.cannotReprocess);
      throw new Error(`reprocessar: ${error.message}`);
    }
    await recordHumanDecision(ctx, i.id, "reprocess", null);
    return { id: i.id, status: "draft" as const };
  },
  { schema: Only, objectRef: (i) => `article:${i.id}`, auditAs: "article.reprocess" },
);

export { recordHumanDecision };

const SourceRow = z.object({
  itemId: z.uuid(),
  role: z.enum(["primary", "secondary", "context"]),
  confirmed: z.boolean(),
});
const SourcesInput = z.object({ id: z.uuid(), sources: z.array(SourceRow).max(30) });
export type SourcesInput = z.infer<typeof SourcesInput>;

/** Bloco "Fontes" do editor: item coletado, papel e confirmação (substitui a lista). */
export const updateSources = studioAction(
  "article.edit",
  (i: SourcesInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const unique = [...new Map(i.sources.map((s) => [s.itemId, s])).values()];
    const del = await ctx.db.from("article_sources").delete().eq("article_id", i.id);
    if (del.error) throw new StudioFailure("forbidden");
    if (unique.length > 0) {
      const { error } = await ctx.db.from("article_sources").insert(
        unique.map((s) => ({
          article_id: i.id,
          item_id: s.itemId,
          role: s.role,
          confirmed: s.confirmed,
        })),
      );
      if (error) throw new StudioFailure("invalid", T.sourcesInvalid);
    }
    ctx.detail({ sources: unique.length });
    return { count: unique.length };
  },
  { schema: SourcesInput, objectRef: (i) => `article:${i.id}`, auditAs: "article.sources" },
);
