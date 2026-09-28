import "server-only";
import { z } from "zod";
import { studioAction, StudioFailure } from "./action";
import { checklist } from "./checklist";
import { loadDraftView } from "./draft-view";
import { articleCacheTags } from "./queue";
import { recordHumanDecision } from "./review";
import { articleScope } from "./scope";

const PublishInput = z.object({
  id: z.uuid(),
  when: z.literal("now"),
});
export type PublishInput = z.infer<typeof PublishInput>;

/**
 * Publica pelo Estúdio (`article.publish`: editor-chefe em tudo, editor na editoria). O checklist
 * é conferido de novo no servidor: incompleto devolve `invalid` com o motivo. Item do pipeline
 * ganha a decisão humana "approve" ao lado da recomendação das regras.
 */
export const publishArticle = studioAction(
  "article.publish",
  (i: PublishInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const view = await loadDraftView(ctx, i.id);
    if (!view) throw new StudioFailure("not_found");
    const c = checklist(view);
    if (!c.complete) throw new StudioFailure("invalid", c.blocker);
    const at = ctx.now().toISOString();
    const { data, error } = await ctx.db
      .from("articles")
      .update({ status: "published", publish_mode: "human", published_at: at, updated_at: at })
      .eq("id", i.id)
      .select("agent_id")
      .maybeSingle();
    if (error || !data) throw new StudioFailure("forbidden");
    if (data.agent_id) await recordHumanDecision(ctx, i.id, "approve", null);
    ctx.detail({ when: "now" });
    await ctx.revalidate(await articleCacheTags(ctx, i.id));
    return { id: i.id, status: "published" as const, publishedAt: at };
  },
  { schema: PublishInput, objectRef: (i) => `article:${i.id}` },
);
