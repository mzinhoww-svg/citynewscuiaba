import { createBrowserClient as createSsrBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { publicSupabaseEnv } from "./env";
import type { Database } from "./types";

export type DbClient = SupabaseClient<Database>;

/** Cliente do navegador (chave anon, sessão em cookies). Use em Client Components. */
export function createBrowserClient(): DbClient {
  const { url, anonKey } = publicSupabaseEnv();
  return createSsrBrowserClient<Database>(url, anonKey);
}
