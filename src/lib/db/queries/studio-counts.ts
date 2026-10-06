import "server-only";
import { canAccess, type Action, type RoleGrant } from "@/lib/auth";
import { studioContext } from "@/lib/studio/context";

/** Pendências mostradas no menu do Estúdio (item 51, E-10). */
export interface StudioCounts {
  /** Rascunhos do pipeline que as regras mandaram para pessoa (aba "Fila de exceção"). */
  exceptions: number;
  /** Denúncias abertas com prazo vencido. */
  reportsOverdue: number;
  /** Pedidos de aprovação aguardando decisão. */
  approvals: number;
  /** Falhas em quarentena ainda não resolvidas (as que a tela Falhas mostra). */
  failures: number;
  /** Imagens aguardando aprovação na Mídia. */
  mediaPending: number;
}

export const ZERO_COUNTS: StudioCounts = {
  exceptions: 0,
  reportsOverdue: 0,
  approvals: 0,
  failures: 0,
  mediaPending: 0,
};

/** Filas cujas falhas aparecem na tela Falhas (O06); mesmo recorte de `listFailures`. */
const FAILURE_QUEUES = ["pipeline", "media", "notify"];

type CountResult = PromiseLike<{ count: number | null; error: { message: string } | null }>;

/**
 * Contagens do menu do Estúdio com a sessão de quem consulta (RLS valendo). Cada número só é
 * consultado para quem vê o item correspondente; os demais ficam em zero. Nunca derruba a casca:
 * erro numa contagem vira zero nela, e erro geral (sem banco, sem sessão) vira tudo zero.
 */
export async function studioCounts(roles: RoleGrant[]): Promise<StudioCounts> {
  try {
    const { db, now } = await studioContext();
    const at = now().toISOString();
    const head = { count: "exact", head: true } as const;
    const safe = async (action: Action, query: () => CountResult): Promise<number> => {
      if (!canAccess(roles, action)) return 0;
      try {
        const r = await query();
        return r.error ? 0 : (r.count ?? 0);
      } catch {
        return 0;
      }
    };
    const [exceptions, reportsOverdue, approvals, failures, mediaPending] = await Promise.all([
      safe("article.edit", () =>
        db
          .from("studio_queue")
          .select("id", head)
          .in("status", ["draft", "in_review"])
          .not("agent_id", "is", null)
          .not("review_reason", "is", null),
      ),
      safe("reports.moderate", () =>
        db.from("reports").select("id", head).eq("status", "open").lt("due_at", at),
      ),
      safe("rules.propose", () => db.from("approvals").select("id", head).eq("status", "pending")),
      safe("source.manage", () =>
        db
          .from("pipeline_quarantine")
          .select("id", head)
          .is("resolved_at", null)
          .in("queue", FAILURE_QUEUES),
      ),
      safe("media.approve", () =>
        db.from("media_assets").select("id", head).eq("status", "pending"),
      ),
    ]);
    return { exceptions, reportsOverdue, approvals, failures, mediaPending };
  } catch {
    return { ...ZERO_COUNTS };
  }
}
