import "server-only";
import { createPublicClient, type DbClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";
import { err, ok, type Result } from "@/lib/result";
import type { QueryError } from "./types";

class ReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReadError";
  }
}

/**
 * Roda uma leitura pública e converte qualquer falha em `Result`: sem variáveis do Supabase
 * vira `unconfigured`; erro de rede, timeout ou do PostgREST vira `unavailable`.
 * As páginas mostram estado amigável em vez de quebrar (portal funciona sem banco).
 */
export async function readPublic<T>(
  fn: (db: DbClient) => Promise<T>,
): Promise<Result<T, QueryError>> {
  let db: DbClient;
  try {
    db = createPublicClient();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err({ kind: "unconfigured" });
    throw e;
  }
  try {
    return ok(await fn(db));
  } catch (e) {
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
}

type Response<T> = { data: T | null; error: { message: string } | null };

/** Resposta de um registro (`maybeSingle`, `rpc` escalar): erro vira exceção de `readPublic`. */
export function one<T>(res: Response<T>): T | null {
  if (res.error) throw new ReadError(res.error.message);
  return res.data;
}

/** Resposta de lista: erro vira exceção de `readPublic`; ausência vira lista vazia. */
export function many<T>(res: Response<T[]>): T[] {
  if (res.error) throw new ReadError(res.error.message);
  return res.data ?? [];
}
