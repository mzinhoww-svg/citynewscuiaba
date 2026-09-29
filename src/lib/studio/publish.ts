import "server-only";
import { z } from "zod";
import { CHECKLIST_TEXT, PUBLISH_TEXT } from "@/content/pt-BR/studio";
import { createServiceClient } from "@/lib/db/client";
import { getFlag } from "@/lib/flags";
import { studioAction, StudioFailure } from "./action";
import { checklist, type ChecklistKey } from "./checklist";
import { loadDraftView } from "./draft-view";
import { DESTINATIONS, planPublication } from "./plan";
import { articleCacheTags } from "./queue";
import { articleScope } from "./scope";
import type { Revalidate } from "./context";

const PublishInput = z.object({
  id: z.uuid(),
  when: z.union([z.literal("now"), z.object({ at: z.string().max(40) })]),
  destinations: z.array(z.enum(DESTINATIONS)).max(4).default(["home", "section"]),
  /** Versão que a pessoa revisou; publicar outra (salva depois) é conflito. */
  baseVersion: z.number().int().min(0).optional(),
});
export type PublishInput = z.input<typeof PublishInput>;

const REASON: Partial<Record<ChecklistKey, string>> = {
  ai_fallback: CHECKLIST_TEXT.reason.aiFallback,
  title_dek: CHECKLIST_TEXT.reason.titleDek,
  taxonomy: CHECKLIST_TEXT.reason.taxonomy,
  primary_source: CHECKLIST_TEXT.reason.primary,
  images: CHECKLIST_TEXT.reason.credit,
  seo: CHECKLIST_TEXT.reason.seo,
};

interface PublishRpc {
  status?: string;
  version?: number;
  snapshot?: Record<string, unknown>;
  blockers?: string[];
  publishedAt?: string | null;
  scheduledFor?: string | null;
}

/**
 * Publica ou agenda pelo Estúdio (`article.publish`: editor-chefe em tudo, editor na editoria).
 * - Horário passado → `invalid` "Escolha um horário futuro".
 * - Checklist conferido no servidor (mensagem da tela) e de novo no banco, na mesma transação
 *   que publica (`studio_publish`, migration 0023): status, versão nova (autor = quem publica),
 *   decisão humana "approve" em item do pipeline. Com `baseVersion`, versão salva depois da
 *   revisada → `conflict`.
 * - Agendar: status `scheduled` com `scheduled_for`; publish_due_scheduled publica na hora
 *   (e refaz o checklist).
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
    const { data, error } = await ctx.db.rpc("studio_publish", {
      p_id: i.id,
      p_destinations: p.destinations,
      ...(i.baseVersion === undefined ? {} : { p_base: i.baseVersion }),
      ...(p.scheduledFor ? { p_at: p.scheduledFor } : {}),
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`publicar: ${error.message}`);
    }
    const r = (data ?? {}) as PublishRpc;
    if (r.status === "not_found") throw new StudioFailure("not_found");
    if (r.status === "already_public")
      throw new StudioFailure("invalid", PUBLISH_TEXT.alreadyPublic);
    if (r.status === "past") throw new StudioFailure("invalid", PUBLISH_TEXT.pastDate);
    if (r.status === "blocked") {
      const key = (r.blockers ?? []).find((b): b is ChecklistKey => b in REASON);
      throw new StudioFailure("invalid", (key && REASON[key]) ?? PUBLISH_TEXT.checklistChanged);
    }
    if (r.status === "conflict")
      throw new StudioFailure("conflict", PUBLISH_TEXT.conflict, { version: r.version ?? 0 });
    if (r.status !== "ok") throw new Error(`publicar: resposta inesperada ${r.status ?? ""}`);

    ctx.detail({
      when: i.when === "now" ? "now" : p.scheduledFor,
      destinations: p.destinations,
      version: r.version,
    });
    if (p.status === "published") await ctx.revalidate(await articleCacheTags(ctx, i.id));
    return {
      id: i.id,
      status: p.status,
      publishedAt: r.publishedAt ? new Date(r.publishedAt).toISOString() : null,
      scheduledFor: r.scheduledFor ? new Date(r.scheduledFor).toISOString() : null,
    };
  },
  { objectRef: (i) => `article:${i.id}` },
);

/**
 * Publica as agendadas que venceram e invalida o cache pendente. Chamado pelo tick do pipeline
 * (rota de cron com CRON_SECRET). O pg_cron roda a mesma função a cada minuto e deixa as tags
 * em `studio_revalidations`; esta função e a rota /api/jobs/revalidate consomem essa fila.
 */
export async function publishDueScheduled(revalidate: Revalidate): Promise<number> {
  // Modo leitura (contingência): nada é publicado, nem agendada vencida; as pendências saem
  // quando o modo é desligado. Flag lida sem cache; erro de leitura vale como ligado (falha fechada).
  if (await getFlag("read_only", { fresh: true })) return 0;
  const db = createServiceClient();
  const { data, error } = await db.rpc("publish_due_scheduled");
  if (error) throw new Error(`agendadas: ${error.message}`);
  await revalidatePending(revalidate);
  return (data ?? []).length;
}

/** Consome as invalidações pendentes (agendadas publicadas pelo pg_cron). Devolve as tags. */
export async function revalidatePending(revalidate: Revalidate): Promise<string[]> {
  const db = createServiceClient();
  const { data, error } = await db.rpc("take_studio_revalidations");
  if (error) throw new Error(`revalidação pendente: ${error.message}`);
  const tags = [...new Set((data ?? []).flatMap((r) => r.tags))];
  if (tags.length > 0) await revalidate(tags);
  return tags;
}
