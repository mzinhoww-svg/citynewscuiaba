import "server-only";
import { z } from "zod";
import { PUBLISH_TEXT } from "@/content/pt-BR/studio";
import { createServiceClient } from "@/lib/db/client";
import { studioAction, StudioFailure } from "./action";
import { checklist } from "./checklist";
import { loadDraftView } from "./draft-view";
import { DESTINATIONS, planPublication } from "./plan";
import { articleCacheTags } from "./queue";
import { recordHumanDecision } from "./review";
import { articleScope } from "./scope";
import type { Revalidate } from "./context";

const PublishInput = z.object({
  id: z.uuid(),
  when: z.union([z.literal("now"), z.object({ at: z.string().max(40) })]),
  destinations: z.array(z.enum(DESTINATIONS)).max(4).default(["home", "section"]),
});
export type PublishInput = z.input<typeof PublishInput>;

/**
 * Publica ou agenda pelo Estúdio (`article.publish`: editor-chefe em tudo, editor na editoria).
 * - Horário passado → `invalid` "Escolha um horário futuro".
 * - Checklist conferido de novo no servidor: incompleto → `invalid` com o motivo.
 * - Publicar: status `published`, `publish_mode = "human"`, versão nova (autor = quem publica),
 *   decisão humana "approve" em item do pipeline e `revalidateTag` das tags da matéria.
 * - Agendar: status `scheduled` com `scheduled_for`; publish_due_scheduled publica na hora.
 * - Nunca dispara push: push de urgente exige 2 aprovações no Control Center.
 */
export const publishArticle = studioAction(
  "article.publish",
  (i: PublishInput, ctx) => articleScope(ctx, i.id),
  async (raw, ctx) => {
    const i = PublishInput.parse(raw);
    const plan = planPublication({ when: i.when, destinations: i.destinations }, ctx.now());
    if (!plan.ok) throw new StudioFailure("invalid", plan.error);
    const view = await loadDraftView(ctx, i.id);
    if (!view) throw new StudioFailure("not_found");
    const c = checklist(view);
    if (!c.complete) throw new StudioFailure("invalid", c.blocker);

    const p = plan.value;
    const at = ctx.now().toISOString();
    const { data, error } = await ctx.db
      .from("articles")
      .update({
        status: p.status,
        publish_mode: p.publishMode,
        published_at: p.publishedAt,
        scheduled_for: p.scheduledFor,
        publish_destinations: p.destinations,
        updated_at: at,
      })
      .eq("id", i.id)
      .not("status", "in", "(published,updated)")
      .select("agent_id, title, dek, body")
      .maybeSingle();
    if (error) throw new StudioFailure("forbidden");
    if (!data) throw new StudioFailure("invalid", PUBLISH_TEXT.alreadyPublic);

    const { data: last } = await ctx.db
      .from("article_versions")
      .select("number")
      .eq("article_id", i.id)
      .order("number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error: vErr } = await ctx.db.from("article_versions").insert({
      article_id: i.id,
      number: (last?.number ?? 0) + 1,
      snapshot: { title: data.title, dek: data.dek, body: data.body },
      origin: "human",
      author_id: ctx.userId,
      change_kind: "edit",
    });
    if (vErr) throw new Error(`versão: ${vErr.message}`);
    if (data.agent_id) await recordHumanDecision(ctx, i.id, "approve", null);

    ctx.detail({
      when: i.when === "now" ? "now" : p.scheduledFor,
      destinations: p.destinations,
    });
    if (p.status === "published") await ctx.revalidate(await articleCacheTags(ctx, i.id));
    return {
      id: i.id,
      status: p.status,
      publishedAt: p.publishedAt,
      scheduledFor: p.scheduledFor,
    };
  },
  { objectRef: (i) => `article:${i.id}` },
);

/**
 * Publica as agendadas que venceram e invalida o cache delas. Chamado pelo tick do pipeline
 * (rota de cron com CRON_SECRET); o pg_cron roda a mesma função a cada minuto sem invalidar.
 */
export async function publishDueScheduled(revalidate: Revalidate): Promise<number> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("publish_due_scheduled");
  if (error) throw new Error(`agendadas: ${error.message}`);
  const rows = data ?? [];
  for (const r of rows)
    await revalidate([
      `article:${r.id}`,
      `article-slug:${r.slug}`,
      ...(r.topic_id ? [`topic:${r.topic_id}`] : []),
      `section:${r.section_slug}`,
      "home",
    ]);
  return rows.length;
}
