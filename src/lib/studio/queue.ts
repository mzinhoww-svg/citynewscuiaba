import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { QUEUE_TEXT } from "@/content/pt-BR/studio";
import { studioAction, StudioFailure, type StudioResult } from "./action";
import type { StudioContext } from "./context";
import { articleScope } from "./scope";

/** Tags de cache de uma matéria pública (mesmas da publicação do pipeline, A-039). */
export async function articleCacheTags(ctx: StudioContext, id: string): Promise<string[]> {
  const { data } = await ctx.db
    .from("articles")
    .select("slug, topic_id, section_slug")
    .eq("id", id)
    .maybeSingle();
  if (!data) return [`article:${id}`, "home"];
  return [
    `article:${id}`,
    `article-slug:${data.slug}`,
    ...(data.topic_id ? [`topic:${data.topic_id}`] : []),
    `section:${data.section_slug}`,
    "home",
    "corrections",
  ];
}

const UnpublishInput = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(1, QUEUE_TEXT.reasonRequired).max(500),
});
export type UnpublishInput = z.infer<typeof UnpublishInput>;

/**
 * Despublica um item automático em 1 clique com motivo obrigatório (`article.unpublish_auto`).
 * Grava a decisão humana `unpublish` ao lado da automática, audita e invalida o cache.
 */
export const unpublishAuto = studioAction(
  "article.unpublish_auto",
  (i: UnpublishInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const { data: a } = await ctx.db
      .from("articles")
      .select("status, publish_mode, rules_version")
      .eq("id", i.id)
      .single();
    if (!a || a.publish_mode !== "auto") throw new StudioFailure("invalid", QUEUE_TEXT.notAuto);
    if (a.status !== "published" && a.status !== "updated")
      throw new StudioFailure("invalid", QUEUE_TEXT.notPublished);
    const tags = await articleCacheTags(ctx, i.id);
    const at = ctx.now().toISOString();
    const { error } = await ctx.db
      .from("articles")
      .update({ status: "unpublished", review_reason: i.reason, updated_at: at })
      .eq("id", i.id);
    if (error) throw new StudioFailure("forbidden");
    const { error: dErr } = await ctx.db.from("decisions").insert({
      object_ref: `article:${i.id}`,
      step: "publish",
      rules_version: a.rules_version,
      input_hash: createHash("sha256").update(`unpublish:${i.id}:${at}`).digest("hex"),
      output: { action: "unpublish_auto" },
      rationale: i.reason,
      human_decision: "unpublish",
      human_id: ctx.userId,
    });
    if (dErr) throw new Error(`decisão: ${dErr.message}`);
    ctx.detail({ reason: i.reason });
    await ctx.revalidate(tags);
    return { id: i.id, status: "unpublished" as const };
  },
  { schema: UnpublishInput, objectRef: (i) => `article:${i.id}` },
);

const AssignOne = z.object({ id: z.uuid(), userId: z.uuid().nullable() });
type AssignOne = z.infer<typeof AssignOne>;

/** Atribuição é gestão da mesa: quem publica na editoria (editor-chefe, editor). */
const assignOne = studioAction(
  "article.publish",
  (i: AssignOne, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const { error } = await ctx.db
      .from("articles")
      .update({ assignee_id: i.userId })
      .eq("id", i.id);
    if (error) throw new StudioFailure("forbidden");
    ctx.detail({ assignee: i.userId });
    return i.id;
  },
  { schema: AssignOne, objectRef: (i) => `article:${i.id}`, auditAs: "article.assign" },
);

const RequestReviewOne = z.object({ id: z.uuid() });
type RequestReviewOne = z.infer<typeof RequestReviewOne>;

/** Pedir revisão: rascunho ou ajuste volta para `in_review` (autoria ou editoria). */
const requestReviewOne = studioAction(
  "article.edit",
  (i: RequestReviewOne, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const { data, error } = await ctx.db
      .from("articles")
      .update({ status: "in_review", updated_at: ctx.now().toISOString() })
      .eq("id", i.id)
      .in("status", ["draft", "changes_requested"])
      .select("id");
    if (error) throw new StudioFailure("forbidden");
    if (!data?.length) throw new StudioFailure("invalid", QUEUE_TEXT.notDraft);
    return i.id;
  },
  {
    schema: RequestReviewOne,
    objectRef: (i) => `article:${i.id}`,
    auditAs: "article.request_review",
  },
);

export interface BatchOutcome {
  done: string[];
  failed: { id: string; error: string; message?: string }[];
}

async function batch<I>(
  items: I[],
  run: (i: I) => Promise<StudioResult<unknown>>,
  idOf: (i: I) => string,
): Promise<BatchOutcome> {
  const out: BatchOutcome = { done: [], failed: [] };
  for (const item of items.slice(0, 100)) {
    const r = await run(item);
    if (r.ok) out.done.push(idOf(item));
    else out.failed.push({ id: idOf(item), error: r.error, message: r.message });
  }
  return out;
}

/** Atribui matérias a uma pessoa (ou tira o responsável com `userId: null`). */
export function assign(input: { ids: string[]; userId: string | null }): Promise<BatchOutcome> {
  return batch(
    input.ids,
    (id) => assignOne({ id, userId: input.userId }),
    (id) => id,
  );
}

export function requestReview(input: { ids: string[] }): Promise<BatchOutcome> {
  return batch(
    input.ids,
    (id) => requestReviewOne({ id }),
    (id) => id,
  );
}

/** Despublica os automáticos selecionados com o mesmo motivo. */
export function unpublishAutoBatch(input: {
  ids: string[];
  reason: string;
}): Promise<BatchOutcome> {
  return batch(
    input.ids,
    (id) => unpublishAuto({ id, reason: input.reason }),
    (id) => id,
  );
}
