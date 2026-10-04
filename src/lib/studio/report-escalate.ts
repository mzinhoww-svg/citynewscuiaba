import "server-only";
import { z } from "zod";
import { MODERATION_TEXT as T } from "@/content/pt-BR/studio";
import { studioAction, StudioFailure } from "./action";

/*
 * Denúncias escalam (AUT-T5, A9): a 3ª denúncia aberta em 24 h na mesma matéria abre um item
 * urgente na fila (uma vez) e liga o banner público "Esta matéria está em revisão". A matéria
 * continua no ar. Quem abre é o gatilho `report_escalate` (migration 0140); aqui ficam a regra
 * espelhada (para teste e documentação) e a resolução humana, que desliga o banner.
 */

export const ESCALATION_THRESHOLD = 3;
export const ESCALATION_WINDOW_HOURS = 24;

export interface EscalationReport {
  kind: string;
  status: string;
  createdAt: string;
}

export type EscalationStep = "below" | "escalate" | "already_open";

/**
 * Mesma regra do gatilho: contam denúncias abertas, das últimas 24 h, que não sejam direito de
 * resposta (fluxo próprio) e posteriores à última resolução humana. Com item já aberto, a nova
 * denúncia não duplica nada.
 */
export function escalationStep(
  reports: readonly EscalationReport[],
  now: Date,
  state: { hasOpen: boolean; lastResolvedAt: string | null },
): EscalationStep {
  const from = now.getTime() - ESCALATION_WINDOW_HOURS * 3_600_000;
  const resolved = state.lastResolvedAt ? Date.parse(state.lastResolvedAt) : -Infinity;
  const counted = reports.filter((r) => {
    const at = Date.parse(r.createdAt);
    return r.status === "open" && r.kind !== "right_of_reply" && at >= from && at > resolved;
  }).length;
  if (counted < ESCALATION_THRESHOLD) return "below";
  return state.hasOpen ? "already_open" : "escalate";
}

const ResolveInput = z.object({
  id: z.uuid(),
  note: z.string().trim().max(500).optional(),
});
export type ResolveEscalationInput = z.infer<typeof ResolveInput>;

const Resolved = z.object({
  status: z.string(),
  articleId: z.string().optional(),
  slug: z.string().optional(),
  topicId: z.string().nullable().optional(),
  sectionSlug: z.string().optional(),
});

/**
 * Resolver o item urgente (pessoa da moderação): encerra o item e desliga o banner da matéria.
 * Vale como decisão humana sobre as denúncias; a resposta ao leitor segue por `respondReport`.
 */
export const resolveEscalation = studioAction(
  "reports.moderate",
  () => ({}),
  async (i: ResolveEscalationInput, ctx) => {
    const { data, error } = await ctx.db.rpc("report_escalation_resolve", {
      p_id: i.id,
      p_note: i.note ?? undefined,
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`escalada: ${error.message}`);
    }
    const r = Resolved.safeParse(data);
    if (!r.success || r.data.status === "not_found") throw new StudioFailure("not_found");
    if (r.data.status === "already_resolved")
      throw new StudioFailure("invalid", T.escalation.alreadyResolved);
    ctx.detail({ article: r.data.articleId, note: i.note });
    if (r.data.articleId)
      await ctx.revalidate([
        `article:${r.data.articleId}`,
        ...(r.data.slug ? [`article-slug:${r.data.slug}`] : []),
        ...(r.data.topicId ? [`topic:${r.data.topicId}`] : []),
        ...(r.data.sectionSlug ? [`section:${r.data.sectionSlug}`] : []),
        "home",
      ]);
    return { id: i.id, articleId: r.data.articleId ?? null };
  },
  { schema: ResolveInput, objectRef: (i) => `escalation:${i.id}`, auditAs: "report.respond" },
);
