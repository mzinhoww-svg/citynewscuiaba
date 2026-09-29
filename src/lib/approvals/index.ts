import "server-only";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { err, ok } from "@/lib/result";
import { studioContext } from "@/lib/studio/context";
import { isCriticalKind, normalizeJustification, targetRefValid, type CriticalKind } from "./kinds";

export * from "./kinds";

/*
 * Aprovação dupla para mudanças críticas (spec §8; plano P5 Task 1).
 *
 * O domínio fala com o banco pelas funções `approval_request` e `approval_decide` (migration
 * 0027, SECURITY INVOKER, com a sessão da pessoa): RLS, o trigger `guard_approvals` e os
 * triggers do alvo seguem valendo, e a decisão, o efeito sobre o alvo e a auditoria das duas
 * pessoas acontecem na mesma transação. Para um tipo novo ter efeito, acrescente o ramo em
 * `approval_apply` (banco) e o efeito em `kinds.ts`.
 */

export type RequestError = "invalid" | "forbidden";
export type DecideError = "self_approval" | "forbidden" | "not_pending" | "stale";

/** Falha com texto para a pessoa (pt-BR). */
export type ApprovalFail<E extends string> = { ok: false; error: E; message: string };
/** `Result<T, E>` cuja falha traz também a mensagem pronta para a tela. */
export type ApprovalResult<T, E extends string> = { ok: true; value: T } | ApprovalFail<E>;

function fail<E extends keyof typeof APPROVAL_ERROR_TEXT>(error: E): ApprovalFail<E> {
  return { ...err(error), message: APPROVAL_ERROR_TEXT[error] };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface RequestApprovalInput {
  kind: CriticalKind;
  targetRef: string;
  justification: string;
}

/**
 * Pede aprovação de uma mudança crítica em nome de quem está logado. Justificativa vazia ou só
 * com espaços, tipo desconhecido ou alvo inválido → `invalid`. O banco também confere o alvo
 * (regras e pesos: proposta da própria pessoa, ainda sem aprovação; desligar forceReview só
 * pelo tipo `force_review.disable`) e audita o pedido (`approval.request`).
 *
 * `forbidden` (sem sessão ou papel sem permissão de pedir o tipo) completa o contrato do plano.
 */
export async function requestApproval(
  input: RequestApprovalInput,
): Promise<ApprovalResult<{ id: string }, RequestError>> {
  const justification = normalizeJustification(input.justification ?? "");
  const kind = String(input.kind);
  const targetRef = String(input.targetRef ?? "");
  if (justification === null || !isCriticalKind(kind) || !targetRefValid(kind, targetRef)) {
    return fail("invalid");
  }
  const ctx = await studioContext();
  if (!ctx.session) return fail("forbidden");
  const { data, error } = await ctx.db.rpc("approval_request", {
    p_kind: kind,
    p_target_ref: targetRef,
    p_justification: justification,
  });
  if (error) {
    if (error.code === "42501") return fail("forbidden");
    if (error.code === "22023") return fail("invalid");
    throw new Error(`approvals: ${error.message}`);
  }
  return ok({ id: data });
}

async function decide(
  id: string,
  decision: "approved" | "rejected",
): Promise<ApprovalResult<void, DecideError>> {
  const ctx = await studioContext();
  if (!ctx.session) return fail("forbidden");
  if (!UUID.test(id)) return fail("not_pending");
  const { data, error } = await ctx.db.rpc("approval_decide", {
    p_id: id,
    p_decision: decision,
  });
  if (error) {
    if (error.code === "42501") return fail("forbidden");
    // P0002: o alvo mudou desde o pedido (a decisão inteira foi desfeita no banco).
    if (error.code === "P0002") return fail("stale");
    throw new Error(`approvals: ${error.message}`);
  }
  switch (data) {
    case "ok":
      return ok(undefined);
    case "self_approval":
    case "forbidden":
    case "not_pending":
      return fail(data);
    default:
      throw new Error(`approvals: resposta inesperada do banco (${String(data)})`);
  }
}

/**
 * Aprova o pedido `id`. Quem pediu nunca aprova (`self_approval`, "A aprovação precisa ser de
 * outra pessoa"); papel sem permissão para o tipo → `forbidden`; pedido já decidido ou
 * inexistente → `not_pending`. Aprovado, o efeito do tipo acontece na mesma transação
 * (regras e pesos entram em vigor; papel, prompt e push ficam autorizados) e a auditoria
 * registra quem pediu e quem aprovou.
 */
export function approve({ id }: { id: string }) {
  return decide(id, "approved");
}

/** Recusa o pedido `id` (mesmas regras de `approve`; o alvo não muda). Decisão final. */
export function reject({ id }: { id: string }) {
  return decide(id, "rejected");
}

/** Pedido pendente de aprovação (lista curta para telas que mostram "aguarda segunda pessoa"). */
export interface PendingApproval {
  id: string;
  kind: CriticalKind;
  targetRef: string;
  justification: string;
  requestedBy: string;
  createdAt: string;
}

/**
 * Pedidos pendentes cujo alvo começa com `targetPrefix` (ex.: `source:<id>:`), do mais antigo ao
 * mais novo. Lê com a sessão da pessoa (RLS: só a equipe vê `approvals`).
 */
export async function pendingApprovals(targetPrefix: string): Promise<PendingApproval[]> {
  const ctx = await studioContext();
  const escaped = targetPrefix.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await ctx.db
    .from("approvals")
    .select("id, kind, target_ref, justification, requested_by, created_at")
    .eq("status", "pending")
    .like("target_ref", `${escaped}%`)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`approvals: ${error.message}`);
  return (data ?? []).flatMap((r) =>
    isCriticalKind(r.kind)
      ? [
          {
            id: r.id,
            kind: r.kind,
            targetRef: r.target_ref,
            justification: r.justification,
            requestedBy: r.requested_by,
            createdAt: r.created_at,
          },
        ]
      : [],
  );
}
