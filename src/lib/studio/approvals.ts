import "server-only";
import { APPROVALS_TEXT as T, APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import {
  createApprovals,
  supabaseApprovalsPort,
  type ApprovalRow,
  type CriticalKind,
} from "@/lib/approvals";
import { APPLIED_HERE, APPROVER_ACTION } from "@/lib/approvals/targets";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import type { GovernanceDecision } from "@/lib/governance";
import { logGovernance } from "@/lib/governance/log";
import { type StudioResult } from "./action";
import { studioContext } from "./context";
import { isReadOnly, READ_ONLY_MESSAGE } from "./read-only";

/*
 * Pedir e decidir aprovações de mudança crítica (P5-T1). O papel exigido depende do tipo
 * (`APPROVER_ACTION`), por isso não passa pelo `studioAction` de ação fixa. A-128: quem pede e
 * tem o papel de aprovar decide e aplica na mesma ação (`requestAndApproveCommand`). A auditoria
 * grava cada passo com quem o fez: `approval.requested` por quem pede e `approval.approved` /
 * `approval.rejected` / `approval.applied` por quem decide (podem ser a mesma pessoa). A RLS e
 * `guard_approvals` conferem tudo de novo no banco.
 */

type Fail = Extract<StudioResult<never>, { ok: false }>;
const fail = (error: Fail["error"], message?: string): Fail =>
  message === undefined ? { ok: false, error } : { ok: false, error, message };

export interface RequestApprovalInput {
  kind: CriticalKind;
  targetRef: string;
  justification: string;
  /** Objeto na auditoria (padrão: o alvo). */
  objectRef?: string;
  details?: Record<string, unknown>;
  /**
   * Decisão do motor de política (A-142, `evaluateGovernance`). `rejected` recusa sem criar
   * pedido; `human_exception`/`auto_review` só pedem (com prazo); `auto_apply` pede, aprova e
   * aplica. Sempre registrada em `governance_decisions`.
   */
  policy?: GovernanceDecision;
}

/** Registra o pedido em nome da pessoa da sessão; não duplica pedido pendente igual. */
export async function requestApprovalCommand(
  i: RequestApprovalInput,
): Promise<StudioResult<{ id: string; existing: boolean }>> {
  const ctx = await studioContext();
  if (!ctx.session) return fail("forbidden");
  const approvals = createApprovals(ctx.db);
  // Só o pedido da própria pessoa e do mesmo tipo vale como "já aberto": outra pessoa pode ter
  // reservado o alvo antes de ele existir, e reaproveitar o pedido dela travaria a proposta.
  const open = (await approvals.pending(i.targetRef)).find(
    (a) =>
      a.targetRef === i.targetRef && a.kind === i.kind && a.requestedBy === ctx.session!.userId,
  );
  if (open) return { ok: true, value: { id: open.id, existing: true } };
  const r = await approvals.requestApproval({
    kind: i.kind,
    targetRef: i.targetRef,
    justification: i.justification,
  });
  if (!r.ok) return fail("invalid", APPROVAL_ERROR_TEXT.invalid);
  await audit(
    ctx.session.userId,
    "approval.requested",
    i.objectRef ?? i.targetRef,
    { approvalId: r.value.id, kind: i.kind, justification: i.justification, ...i.details },
    ctx.db,
  );
  return { ok: true, value: { id: r.value.id, existing: false } };
}

export interface DecideApprovalInput {
  id: string;
  decision: "approve" | "reject";
  reason?: string;
}

export interface DecideOutcome {
  /** Aplicado junto com a aprovação (regras, flags); `null` quando recusado. */
  applied: boolean | null;
  row: ApprovalRow;
}

/** Aprova (e aplica, quando o tipo se aplica aqui) ou recusa um pedido pendente. */
export async function decideApprovalCommand(
  i: DecideApprovalInput,
): Promise<StudioResult<DecideOutcome>> {
  const ctx = await studioContext();
  const session = ctx.session;
  if (!session) return fail("forbidden");
  if (await isReadOnly(ctx.db)) return fail("conflict", READ_ONLY_MESSAGE);
  const port = supabaseApprovalsPort(ctx.db);
  const row = await port.get(i.id);
  if (!row) return fail("not_found", APPROVAL_ERROR_TEXT.not_pending);
  const kind = row.kind as CriticalKind;
  const action = APPROVER_ACTION[kind];
  if (!action || !canAccess(session.roles, action)) {
    await audit(
      session.userId,
      "approval.approved.denied",
      row.targetRef,
      { approvalId: i.id },
      ctx.db,
    );
    return fail("forbidden", APPROVAL_ERROR_TEXT.forbidden);
  }
  const approvals = createApprovals(ctx.db);

  if (i.decision === "reject") {
    const reason = i.reason?.trim() ?? "";
    if (!reason) return fail("invalid", T.dialog.rejectRequired);
    const r = await approvals.reject({ id: i.id, reason });
    if (!r.ok) return fail("conflict", APPROVAL_ERROR_TEXT[r.error]);
    await audit(
      session.userId,
      "approval.rejected",
      row.targetRef,
      { approvalId: i.id, kind, reason, requestedBy: row.requestedBy },
      ctx.db,
    );
    return { ok: true, value: { applied: null, row: { ...row, status: "rejected" } } };
  }

  if (!APPLIED_HERE.has(kind)) {
    // Tipo com consumidor próprio (prompt, pesos, papel, push): só registra a aprovação.
    const r = await approvals.approve({ id: i.id });
    if (!r.ok) return fail("conflict", APPROVAL_ERROR_TEXT[r.error]);
    await audit(
      session.userId,
      "approval.approved",
      row.targetRef,
      { approvalId: i.id, kind, requestedBy: row.requestedBy },
      ctx.db,
    );
    return { ok: true, value: { applied: false, row: { ...row, status: "approved" } } };
  }

  const r = await approvals.approveAndApply({ id: i.id });
  const decided = r.ok || !["forbidden", "not_pending"].includes(r.error);
  if (decided)
    await audit(
      session.userId,
      "approval.approved",
      row.targetRef,
      { approvalId: i.id, kind, requestedBy: row.requestedBy },
      ctx.db,
    );
  if (!r.ok) {
    if (!decided) return fail("conflict", APPROVAL_ERROR_TEXT[r.error as "forbidden"]);
    return fail("conflict", T.approvedNotApplied(T.applyError[r.error] ?? r.error));
  }
  await audit(
    session.userId,
    "approval.applied",
    row.targetRef,
    { approvalId: i.id, kind, requestedBy: row.requestedBy },
    ctx.db,
  );
  return { ok: true, value: { applied: true, row: { ...row, status: "applied" } } };
}

export interface RequestAndApproveOutcome {
  id: string;
  /**
   * `applied`: aplicado aqui (regras, flags). `approved`: aprovado, o consumidor do alvo aplica em
   * seguida (prompt, pesos, papel, fonte, push). `pending`: o papel de quem pediu não aprova este
   * tipo; o pedido fica na caixa de aprovações para quem pode.
   */
  status: "pending" | "approved" | "applied";
  /** Motivo da política (para a mensagem da tela), quando houve decisão do motor. */
  reason?: string;
}

/**
 * A-128: pede e, se a pessoa tem o papel que aprova o tipo, aprova (e aplica, quando o tipo se
 * aplica aqui) na mesma ação. O pedido e a decisão ficam registrados em `approvals` e na
 * auditoria com o nome de quem fez cada passo.
 */
export async function requestAndApproveCommand(
  i: RequestApprovalInput,
): Promise<StudioResult<RequestAndApproveOutcome>> {
  const policy = i.policy;
  if (policy?.outcome === "rejected") {
    const ctx = await studioContext();
    await logGovernance(ctx.db, i.kind, i.targetRef, policy);
    return fail("invalid", T.policyRejected(policy.reason));
  }
  const req = await requestApprovalCommand(i);
  if (!req.ok) return req;
  const ctx = await studioContext();
  const action = APPROVER_ACTION[i.kind];
  const exception = policy && policy.outcome !== "auto_apply";
  if (policy) await logGovernance(ctx.db, i.kind, i.targetRef, policy, req.value.id);
  if (exception || !ctx.session || !action || !canAccess(ctx.session.roles, action))
    return { ok: true, value: { id: req.value.id, status: "pending", reason: policy?.reason } };
  const decided = await decideApprovalCommand({ id: req.value.id, decision: "approve" });
  if (!decided.ok) {
    // A RLS do banco pode recusar a decisão a um papel que a matriz deixa propor e aprovar (ex.:
    // operador_ia nos pesos): o pedido segue aberto na caixa de aprovações.
    const row = await supabaseApprovalsPort(ctx.db).get(req.value.id);
    if (row?.status === "pending")
      return { ok: true, value: { id: req.value.id, status: "pending" } };
    return decided;
  }
  return {
    ok: true,
    value: { id: req.value.id, status: decided.value.applied ? "applied" : "approved" },
  };
}
