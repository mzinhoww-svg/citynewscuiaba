import "server-only";
import type { User } from "@supabase/supabase-js";
import { createServerClient, type DbClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";

/**
 * Sessão do leitor no servidor (conta opcional). `getUser` valida o token no Auth; sem
 * variáveis do Supabase ou sem sessão, `null` (as telas públicas seguem sem conta).
 */
export async function getReader(): Promise<{ db: DbClient; user: User } | null> {
  let db: DbClient;
  try {
    db = await createServerClient();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return null;
    throw e;
  }
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  return { db, user: data.user };
}

/** Cliente com a sessão do leitor (cookies), ou `null` sem Supabase configurado. */
export async function readerClient(): Promise<DbClient | null> {
  try {
    return await createServerClient();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return null;
    throw e;
  }
}

/** Login com Google só aparece ativo quando o provedor está configurado no Auth (B-006). */
export function googleEnabled(env: Partial<Record<string, string>> = process.env): boolean {
  return env.AUTH_GOOGLE_ENABLED === "1" || env.AUTH_GOOGLE_ENABLED === "true";
}
