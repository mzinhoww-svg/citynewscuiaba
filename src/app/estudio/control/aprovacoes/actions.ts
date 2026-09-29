"use server";

import { APPROVALS_TEXT as T } from "@/content/pt-BR/approvals";
import { decideApprovalCommand } from "@/lib/studio/approvals";

/* Server Action da caixa de aprovações (P5-T1): camada fina sobre src/lib/studio/approvals. */

export interface ApprovalActionReply {
  ok: boolean;
  message: string;
}

export async function decideApprovalAction(i: {
  id: string;
  decision: "approve" | "reject";
  reason?: string;
}): Promise<ApprovalActionReply> {
  const r = await decideApprovalCommand(i);
  if (r.ok) {
    if (r.value.applied === null) return { ok: true, message: T.rejected };
    return {
      ok: true,
      message: r.value.applied ? T.approved : T.approvedApplyElsewhere,
    };
  }
  return { ok: false, message: r.message ?? T.genericError };
}
