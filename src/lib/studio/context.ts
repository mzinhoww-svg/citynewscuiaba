import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Session } from "@/lib/auth/permissions";
import type { DbClient } from "@/lib/db/client";
import type { MediaStore } from "@/lib/media/store";

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
  /** Storage das cópias de imagem (remoção a pedido). Padrão: o de produção. */
  mediaStore?: MediaStore;
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
  return requestContext();
}

/**
 * Resolve a sessão e o cliente uma vez e roda `fn` com eles (lotes da fila: 100 itens não
 * refazem `getUser()` e a leitura de papéis 100 vezes). Dentro de um contexto explícito, reusa.
 */
export async function withSharedStudioContext<T>(fn: () => Promise<T>): Promise<T> {
  if (store.getStore()) return fn();
  return store.run(await requestContext(), fn);
}

async function requestContext(): Promise<StudioContext> {
  const [{ getSession }, { createServerClient }, { revalidateTags }] = await Promise.all([
    import("@/lib/auth/require-role"),
    import("@/lib/db/client"),
    import("@/lib/pipeline/revalidate"),
  ]);
  const [session, db] = await Promise.all([getSession(), createServerClient()]);
  return { session, db, revalidate: revalidateTags, now: () => new Date() };
}
