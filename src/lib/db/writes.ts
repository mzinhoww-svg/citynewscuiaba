import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { err, ok, type Result } from "@/lib/result";
import { createServiceClient, type DbClient } from "./client";
import { SupabaseEnvError } from "./env";

/** Falha de escrita pública: sem service role configurada ou banco fora. */
export type WriteError = { kind: "unconfigured" | "unavailable" };

async function withService<T>(fn: (db: DbClient) => Promise<T>): Promise<Result<T, WriteError>> {
  let db: DbClient;
  try {
    db = createServiceClient();
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err({ kind: "unconfigured" });
    throw e;
  }
  try {
    return ok(await fn(db));
  } catch {
    return err({ kind: "unavailable" });
  }
}

/**
 * Registra um uso no limite compartilhado (0003_rate_limits, A-028) e diz se ainda cabe.
 * `keyHash` já vem com hash (nunca IP cru).
 */
export async function hitRateLimit(
  bucket: string,
  keyHash: string,
  limit: number,
  windowSeconds: number,
): Promise<Result<boolean, WriteError>> {
  return withService(async (db) => {
    const { data, error } = await db.rpc("hit_rate_limit", {
      p_bucket: bucket,
      p_key_hash: keyHash,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });
    if (error) throw new Error(error.message);
    return data === true;
  });
}

/**
 * Inscrição na newsletter sem confirmação ainda (o envio fica na fila `notify` até haver
 * provedor, A-008/B-005). Reinscrição do mesmo e-mail não duplica nem reativa quem saiu.
 */
export async function saveNewsletterSubscription(
  email: string,
  list: string,
): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    const { error } = await db
      .from("newsletter_subscriptions")
      .upsert(
        { email, list, token_hash: tokenHash },
        { onConflict: "email,list", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);
  });
}

/** Denúncia de leitor (Informar problema): entra na fila do Estúdio com prazo de 24 h (E14). */
export async function saveReport(r: {
  contentRef: string;
  kind: "wrong_info" | "broken_link" | "image" | "right_of_reply" | "other";
  message: string | null;
  contactEmail: string | null;
}): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const { error } = await db.from("reports").insert({
      content_ref: r.contentRef,
      kind: r.kind,
      message: r.message,
      contact_email: r.contactEmail,
    });
    if (error) throw new Error(error.message);
  });
}
