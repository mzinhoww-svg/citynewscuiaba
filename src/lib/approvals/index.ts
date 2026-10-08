/**
 * Aprovações (P5-T1, antecipado pelo painel de fontes para `source.critical`). As funções soltas
 * usam o cliente do servidor com a sessão da pessoa: RLS e `guard_approvals` valem sempre.
 */
import "server-only";
import { createServerClient } from "@/lib/db/client";
import { createApprovals, type ApprovalRow, type CriticalKind } from "./approvals";

export {
  CRITICAL_KINDS,
  createApprovals,
  supabaseApprovalsPort,
  type ApprovalRow,
  type CriticalKind,
} from "./approvals";
export { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/sources-admin";

async function bound() {
  return createApprovals(await createServerClient());
}

export async function requestApproval(input: {
  kind: CriticalKind;
  targetRef: string;
  justification: string;
}) {
  return (await bound()).requestApproval(input);
}

export async function approve(input: { id: string }) {
  return (await bound()).approve(input);
}

export async function reject(input: { id: string; reason: string }) {
  return (await bound()).reject(input);
}

export async function pending(targetPrefix: string): Promise<ApprovalRow[]> {
  return (await bound()).pending(targetPrefix);
}
