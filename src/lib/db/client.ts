import "server-only";
import { createServerClient as createSsrServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
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
    global: { fetch: fetchWithTimeout(DB_FETCH_TIMEOUT_MS) },
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

/**
 * Tempo máximo de uma requisição ao Supabase nos clientes de leitor e público (item 82): build,
 * ISR e páginas não travam com o banco lento; a falha vira o estado de erro da tela.
 */
export const DB_FETCH_TIMEOUT_MS = 8000;

/**
 * Prazo do service role (cron, pipeline e rotas de servidor). É por requisição, não por lote:
 * os lotes longos (ingestão, venues com `maxDuration` 300) fazem muitas chamadas curtas. 20 s
 * cobre as RPCs mais pesadas e o upload de imagem ao Storage com folga.
 */
export const SERVICE_FETCH_TIMEOUT_MS = 20_000;

/**
 * Cliente anônimo sem sessão para as páginas públicas com ISR (P1). Não lê cookies, então não
 * torna a rota dinâmica; respeita RLS como `anon`. Lança `SupabaseEnvError` sem variáveis:
 * quem chama (src/lib/db/queries) converte em `Result`.
 */
export function createPublicClient(cache?: PublicCache): DbClient {
  const { url, anonKey } = publicSupabaseEnv();
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: fetchWithTimeout(DB_FETCH_TIMEOUT_MS, (input, init) =>
        fetch(input, {
          ...init,
          ...(cache ? { next: { tags: cache.tags, revalidate: cache.revalidate } } : {}),
        }),
      ),
    },
  });
}

/**
 * Cache de dados do Next para leituras de página com ISR: `revalidateTag("article:<id>")`
 * invalida a página que usou essas leituras (architecture §8).
 */
export interface PublicCache {
  tags: string[];
  revalidate: number;
}

/** Cliente com service role: ignora RLS. Só pipeline e rotas de servidor. */
export function createServiceClient(): DbClient {
  const { url, serviceRoleKey } = serviceSupabaseEnv();
  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchWithTimeout(SERVICE_FETCH_TIMEOUT_MS) },
  });
}
