import "server-only";
import { canAccess } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import { studioContext, withSharedStudioContext } from "./context";
import { publishArticle } from "./publish";

/** Rotas das regras que recomendam publicar (`decisions.recommended`). */
const PUBLISH_ROUTES = new Set(["publish", "publish_notify"]);
/** Teto de matérias por lote (o mesmo das outras ações em lote da fila). */
export const APPROVE_RECOMMENDED_MAX = 100;

export type SkipReason = "not_recommended" | "not_found" | "forbidden" | "invalid" | "conflict";

export interface ApproveRecommendedOutcome {
  approved: number;
  skipped: { id: string; reason: SkipReason; message?: string }[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Aprovar recomendadas" da fila (UX-W3-T1, item 46): aprova e publica agora só as matérias cuja
 * última decisão das regras recomendou publicar (`publish` ou `publish_notify`). A recomendação
 * é lida de novo no banco (a tela pode estar velha); cada publicação passa por `publishArticle`
 * (papel na editoria, checklist, modo leitura, auditoria `article.publish` e decisão humana
 * "approve"). O lote inteiro fica auditado como `article.bulk_approve`, com o que foi aprovado e o
 * que ficou na fila e por quê. Nunca dispara push: "publicar e avisar" vira só publicar.
 */
export async function approveRecommended(rawIds: string[]): Promise<ApproveRecommendedOutcome> {
  const ids = [...new Set(rawIds.filter((id) => UUID.test(id)))].slice(0, APPROVE_RECOMMENDED_MAX);
  return withSharedStudioContext(async () => {
    const ctx = await studioContext();
    const session = ctx.session;
    const out: ApproveRecommendedOutcome = { approved: 0, skipped: [] };
    if (!session || !canAccess(session.roles, "article.publish")) {
      out.skipped = ids.map((id) => ({ id, reason: "forbidden" }));
      if (session)
        await audit(
          session.userId,
          "article.bulk_approve.denied",
          "queue:approve_recommended",
          { ids },
          ctx.db,
        );
      return out;
    }

    const { data, error } = ids.length
      ? await ctx.db.from("studio_queue").select("id, recommended").in("id", ids)
      : { data: [], error: null };
    if (error) throw new Error(`aprovar recomendadas: ${error.message}`);
    const recommended = new Map((data ?? []).map((r) => [r.id, r.recommended]));

    const approved: string[] = [];
    for (const id of ids) {
      if (!recommended.has(id)) {
        out.skipped.push({ id, reason: "not_found" });
        continue;
      }
      const route = recommended.get(id);
      if (!route || !PUBLISH_ROUTES.has(route)) {
        out.skipped.push({ id, reason: "not_recommended" });
        continue;
      }
      const r = await publishArticle({ id, when: "now" });
      if (r.ok) approved.push(id);
      else
        out.skipped.push(
          r.message ? { id, reason: r.error, message: r.message } : { id, reason: r.error },
        );
    }
    out.approved = approved.length;

    await audit(
      session.userId,
      "article.bulk_approve",
      "queue:approve_recommended",
      { approved, skipped: out.skipped.map(({ id, reason }) => ({ id, reason })) },
      ctx.db,
    );
    return out;
  });
}
