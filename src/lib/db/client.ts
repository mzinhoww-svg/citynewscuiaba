import "server-only";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { DbClient } from "./browser";
import { publicSupabaseEnv, serviceSupabaseEnv } from "./env";
import type { Database } from "./types";

// Client Components importam `createBrowserClient` de "@/lib/db/browser" (este módulo é server-only).
export { createBrowserClient } from "./browser";
export type { DbClient } from "./browser";
export type { Database } from "./types";

/**
 * Cliente do servidor com a sessão do leitor (cookies do Next). Respeita RLS.
 * Assíncrono porque `cookies()` é assíncrono no Next 15+.
 */
export async function createServerClient(): Promise<DbClient> {
  const { url, anonKey } = publicSupabaseEnv();
  const cookieStore = await cookies();
  return createSsrServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) cookieStore.set(name, value, options);
        } catch {
          // Server Component não pode gravar cookies; o proxy/middleware renova a sessão.
        }
      },
    },
  });
}

/** Cliente com service role: ignora RLS. Só pipeline e rotas de servidor. */
export function createServiceClient(): DbClient {
  const { url, serviceRoleKey } = serviceSupabaseEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
