import "server-only";
import { z } from "zod";
import { studioAction, StudioFailure } from "./action";
import { articleScope } from "./scope";

const PublishInput = z.object({
  id: z.uuid(),
  when: z.literal("now").default("now"),
});
export type PublishInput = z.input<typeof PublishInput>;

/** Publica uma matéria pelo Estúdio (`article.publish`: editor-chefe em tudo, editor na editoria). */
export const publishArticle = studioAction(
  "article.publish",
  (i: PublishInput, ctx) => articleScope(ctx, i.id),
  async (i, ctx) => {
    const at = ctx.now().toISOString();
    const { data, error } = await ctx.db
      .from("articles")
      .update({ status: "published", publish_mode: "human", published_at: at, updated_at: at })
      .eq("id", i.id)
      .select("id")
      .maybeSingle();
    if (error || !data) throw new StudioFailure("forbidden");
    ctx.detail({ when: "now" });
    return { id: i.id, status: "published" as const, publishedAt: at };
  },
  { schema: PublishInput as z.ZodType<PublishInput>, objectRef: (i) => `article:${i.id}` },
);
