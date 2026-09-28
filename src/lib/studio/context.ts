import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "@/lib/auth/permissions";
import type { DbClient } from "@/lib/db/client";

/** Invalida tags do cache de dados do Next (architecture §8). */
export type Revalidate = (tags: string[]) => Promise<void>;

/**
 * O que uma Server Action do Estúdio enxerga: a sessão (validada no Supabase Auth), o cliente
 * do banco com a sessão da pessoa (RLS valendo), a invalidação de cache e o relógio.
 */
export interface StudioContext {
  session: Session | null;
  db: DbClient;
  revalidate: Revalidate;
  now: () => Date;
}

const store = new AsyncLocalStorage<StudioContext>();

/**
 * Executa `fn` com um contexto explícito. Testes de integração usam para rodar as ações como um
 * usuário de seed; em produção o contexto vem da requisição (cookies).
 */
export function runWithStudioContext<T>(ctx: StudioContext, fn: () => Promise<T>): Promise<T> {
  return store.run(ctx, fn);
}

/** Contexto atual: o explícito, se houver; senão, o da requisição do Next. */
export async function studioContext(): Promise<StudioContext> {
  const explicit = store.getStore();
  if (explicit) return explicit;
  const [{ getSession }, { createServerClient }, { revalidateTags }] = await Promise.all([
    import("@/lib/auth/require-role"),
    import("@/lib/db/client"),
    import("@/lib/pipeline/revalidate"),
  ]);
  const [session, db] = await Promise.all([getSession(), createServerClient()]);
  return { session, db, revalidate: revalidateTags, now: () => new Date() };
}
