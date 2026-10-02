import "server-only";
import type { DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { studioContext } from "@/lib/studio/context";

/**
 * Grava uma linha em `audit_log` em nome de `actor` (sempre a pessoa da sessão: o banco recusa
 * outro ator). Tentativas negadas usam a ação com sufixo `.denied`.
 *
 * ```ts
 * await audit(userId, "article.publish", `article:${id}`, { when: "now" });
 * ```
 */
export async function audit(
  actor: string,
  action: string,
  objectRef: string,
  details: Record<string, unknown> = {},
  db?: DbClient,
): Promise<void> {
  const client = db ?? (await studioContext()).db;
  const { error } = await client.rpc("studio_audit", {
    p_actor: actor,
    p_action: action,
    p_object_ref: objectRef,
    p_details: details as Json,
  });
  if (error) throw new Error(`audit: ${error.message}`);
}
