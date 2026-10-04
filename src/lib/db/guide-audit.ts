import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import type { GuideAuditAction } from "@/lib/audit/actions";

/** Autor das ações automáticas do Guia (cron de propostas e de atualização) na auditoria. */
export const GUIDE_SYSTEM_ACTOR = "system:guide";

/**
 * Registro de uma ação do Guia sem pessoa por trás (proposta semanal, publicação pelas regras,
 * atualização de 90 dias). Só o service role grava direto em `audit_log`.
 */
export async function guideSystemAudit(
  db: DbClient,
  action: GuideAuditAction,
  objectRef: string,
  details: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    actor: GUIDE_SYSTEM_ACTOR,
    action,
    object_ref: objectRef,
    details: details as NonNullable<Json>,
  });
  if (error) throw new Error(`guide audit: ${error.message}`);
}
