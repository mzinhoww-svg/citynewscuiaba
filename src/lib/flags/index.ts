import "server-only";
import { READ_ONLY_MESSAGE } from "@/content/pt-BR/contingency";
import { audit } from "@/lib/audit";
import { isAdminRole } from "@/lib/admin/access";
import type { RoleGrant } from "@/lib/auth/permissions";
import { createPublicClient } from "@/lib/db/client";
import { err, ok, type Result } from "@/lib/result";
import { studioContext } from "@/lib/studio/context";
import { FAIL_CLOSED, FLAG_KEYS, isFlagKey, isSafetySafeguardKey, type FlagKey } from "./keys";

export { CONTINGENCY_KEYS, FAIL_CLOSED, FLAG_KEYS, isFlagKey } from "./keys";
export type { ContingencyKey, FlagKey } from "./keys";

/*
 * `feature_flags` (P5-T10). Leitura com cache curto e falha fechada; escrita só de admin, com
 * auditoria de ator e valor. O pipeline lê as suas flags sem cache (`createFlags`, a cada item),
 * de modo que pausar no meio de um ciclo vale já para o próximo item.
 */

/** Validade do cache de leitura (ms). A escrita por `setFlag` derruba o cache do processo. */
export const FLAG_CACHE_MS = 5_000;

const cache = new Map<FlagKey, { at: number; value: boolean }>();

/** Zera o cache (escrita por `setFlag`, testes). */
export function resetFlagCache(): void {
  cache.clear();
}

/**
 * Lê uma flag. Erro de leitura, linha ausente ou banco fora: valor de `FAIL_CLOSED` (sem cache,
 * para a próxima leitura tentar de novo). `fresh` ignora o cache (portões de escrita).
 */
export async function getFlag(key: FlagKey, opts: { fresh?: boolean } = {}): Promise<boolean> {
  const hit = cache.get(key);
  if (!opts.fresh && hit && Date.now() - hit.at < FLAG_CACHE_MS) return hit.value;
  try {
    const { data, error } = await createPublicClient()
      .from("feature_flags")
      .select("enabled")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return FAIL_CLOSED[key];
    cache.set(key, { at: Date.now(), value: data.enabled });
    return data.enabled;
  } catch {
    return FAIL_CLOSED[key];
  }
}

/** Mensagem de bloqueio se o Estúdio está em modo leitura (leitura sem cache); senão `null`. */
export async function readOnlyNotice(): Promise<string | null> {
  return (await getFlag("read_only", { fresh: true })) ? READ_ONLY_MESSAGE : null;
}

export type FlagError = "forbidden" | "invalid_key" | "approval_required" | "unavailable";

export interface FlagActor {
  userId: string;
  roles: RoleGrant[];
}

export interface FlagChange {
  key: FlagKey;
  value: boolean;
  previous: boolean | null;
}

/**
 * Muda uma flag. Só admin (a RLS de `feature_flags` também exige). Chave fora da lista fechada é
 * recusada; nomes de salvaguarda de segurança (`safety…`, `never_auto`, `force_review`) nunca
 * passam por aqui: exigem aprovação de outra pessoa (`safety.disable`, `force_review.disable`) na
 * versão de regras. Toda mudança e toda recusa entram no `audit_log` com ator, valor e motivo.
 */
export async function setFlag(
  key: string,
  value: boolean,
  actor: FlagActor,
  reason?: string,
): Promise<Result<FlagChange, FlagError>> {
  const ref = `flag:${key.slice(0, 60)}`;
  const deny = async (error: FlagError) => {
    await audit(actor.userId, "flag.set.denied", ref, { value, error }).catch(() => undefined);
    return err(error);
  };
  if (!isAdminRole(actor.roles)) return deny("forbidden");
  if (isSafetySafeguardKey(key)) return deny("approval_required");
  if (!isFlagKey(key)) return deny("invalid_key");

  const ctx = await studioContext();
  const before = await ctx.db.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  if (before.error || !before.data) return err("unavailable");
  const up = await ctx.db
    .from("feature_flags")
    .update({ enabled: value, updated_by: actor.userId, updated_at: ctx.now().toISOString() })
    .eq("key", key)
    .select("key")
    .maybeSingle();
  if (up.error || !up.data) return err("unavailable");
  resetFlagCache();
  await audit(actor.userId, "flag.set", ref, {
    value,
    previous: before.data.enabled,
    ...(reason?.trim() ? { reason: reason.trim().slice(0, 500) } : {}),
  });
  return ok({ key, value, previous: before.data.enabled });
}

export interface FlagState {
  key: FlagKey;
  enabled: boolean | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

/** Estado de todas as flags com quem mudou e quando (leitura da equipe, sem cache). */
export async function listFlagStates(): Promise<FlagState[]> {
  const { db } = await studioContext();
  const r = await db.from("feature_flags").select("key, enabled, updated_by, updated_at");
  if (r.error) throw new Error(`flags: ${r.error.message}`);
  const ids = [...new Set((r.data ?? []).flatMap((f) => (f.updated_by ? [f.updated_by] : [])))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const p = await db.from("profiles").select("id, display_name").in("id", ids);
    for (const row of p.data ?? []) names.set(row.id, row.display_name);
  }
  const byKey = new Map((r.data ?? []).map((f) => [f.key, f]));
  return FLAG_KEYS.map((key) => {
    const f = byKey.get(key);
    return {
      key,
      enabled: f?.enabled ?? null,
      updatedBy: f?.updated_by ?? null,
      updatedByName: f?.updated_by ? (names.get(f.updated_by) ?? null) : null,
      updatedAt: f?.updated_by ? f.updated_at : null,
    };
  });
}
