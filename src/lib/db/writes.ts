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
 * Inscrição na newsletter sem confirmação (confirmação dupla por link assinado, P19). Não
 * duplica; quem tinha saído volta a ficar pendente. Devolve as listas que já estavam ativas.
 */
export async function saveNewsletterLists(
  email: string,
  lists: string[],
): Promise<Result<{ alreadyActive: string[] }, WriteError>> {
  return withService(async (db) => {
    const { data, error } = await db
      .from("newsletter_subscriptions")
      .select("list, confirmed_at, unsubscribed_at")
      .eq("email", email)
      .in("list", lists);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const alreadyActive = rows
      .filter((r) => r.confirmed_at && !r.unsubscribed_at)
      .map((r) => r.list);
    const toWrite = lists.filter((l) => !alreadyActive.includes(l));
    if (toWrite.length) {
      const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
      const { error: e2 } = await db.from("newsletter_subscriptions").upsert(
        toWrite.map((list) => ({
          email,
          list,
          token_hash: tokenHash,
          confirmed_at: null,
          unsubscribed_at: null,
        })),
        { onConflict: "email,list" },
      );
      if (e2) throw new Error(e2.message);
    }
    return { alreadyActive };
  });
}

export type NewsletterPref = { list: string; state: "active" | "pending" | "off" };

/** Estado de cada lista de um e-mail (centro de preferências). */
export async function getNewsletterPrefs(
  email: string,
): Promise<Result<NewsletterPref[], WriteError>> {
  return withService(async (db) => {
    const { data, error } = await db
      .from("newsletter_subscriptions")
      .select("list, confirmed_at, unsubscribed_at")
      .eq("email", email);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => ({
      list: r.list,
      state: r.unsubscribed_at ? "off" : r.confirmed_at ? "active" : "pending",
    }));
  });
}

/** Confirma as listas do link (confirmação dupla); não reativa quem saiu depois. */
export async function confirmNewsletter(
  email: string,
  lists: string[],
): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const { error } = await db
      .from("newsletter_subscriptions")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("email", email)
      .in("list", lists)
      .is("confirmed_at", null)
      .is("unsubscribed_at", null);
    if (error) throw new Error(error.message);
  });
}

/**
 * Preferências salvas pelo link assinado: as listas marcadas ficam ativas (confirmadas, pois o
 * link prova o e-mail) e as demais saem.
 */
export async function setNewsletterPrefs(
  email: string,
  keep: string[],
  all: readonly string[],
): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const now = new Date().toISOString();
    const tokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");
    if (keep.length) {
      const { error } = await db.from("newsletter_subscriptions").upsert(
        keep.map((list) => ({
          email,
          list,
          token_hash: tokenHash,
          confirmed_at: now,
          unsubscribed_at: null,
        })),
        { onConflict: "email,list" },
      );
      if (error) throw new Error(error.message);
    }
    const off = all.filter((l) => !keep.includes(l));
    if (off.length) {
      const { error } = await db
        .from("newsletter_subscriptions")
        .update({ unsubscribed_at: now })
        .eq("email", email)
        .in("list", off)
        .is("unsubscribed_at", null);
      if (error) throw new Error(error.message);
    }
  });
}

/** Janela de dedupe dos e-mails para leitores: 1 por tipo e endereço a cada 10 min. */
const READER_EMAIL_DEDUPE_MS = 10 * 60_000;

/**
 * Põe um e-mail para leitor na fila de saída `reader_emails` (B-005: nada é enviado ainda).
 * Pedidos repetidos em 10 min não geram outra mensagem.
 */
export async function queueReaderEmail(mail: {
  kind: "newsletter_confirm" | "newsletter_manage" | "alert_confirm";
  to: string;
  subject: string;
  body: string;
}): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const since = new Date(Date.now() - READER_EMAIL_DEDUPE_MS).toISOString();
    const { data, error } = await db
      .from("reader_emails")
      .select("id")
      .eq("to_email", mail.to)
      .eq("kind", mail.kind)
      .gte("created_at", since)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length > 0) return;
    const { error: e2 } = await db.from("reader_emails").insert({
      kind: mail.kind,
      to_email: mail.to,
      subject: mail.subject.slice(0, 200),
      body: mail.body.slice(0, 4000),
    });
    if (e2) throw new Error(e2.message);
  });
}

/** Alerta por e-mail sem conta (P18): fica inativo até a confirmação pelo link. */
export async function saveEmailAlert(a: {
  email: string;
  targetKind: string;
  targetId: string;
  frequency: "immediate" | "daily" | "weekly";
}): Promise<Result<{ id: string }, WriteError>> {
  return withService(async (db) => {
    const { data, error } = await db
      .from("alerts")
      .insert({
        owner_ref: `email:${a.email}`,
        target_kind: a.targetKind,
        target_id: a.targetId,
        frequency: a.frequency,
        channel: "email",
        active: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id };
  });
}

/** Confirma (ativa) alertas por e-mail do link assinado. Devolve quantos foram ativados. */
export async function confirmEmailAlerts(
  email: string,
  ids: string[],
): Promise<Result<number, WriteError>> {
  return withService(async (db) => {
    const { data, error } = await db
      .from("alerts")
      .update({ active: true })
      .eq("owner_ref", `email:${email}`)
      .eq("channel", "email")
      .in("id", ids)
      .select("id");
    if (error) throw new Error(error.message);
    return (data ?? []).length;
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

/** Sugestão de evento de leitor: fila `event_submissions` (E13), revisada em até 48 h. */
export async function saveEventSubmission(s: {
  title: string;
  startsAt: string;
  endsAt: string | null;
  venue: string;
  neighborhood: string | null;
  priceCents: number | null;
  ageRating: string;
  link: string | null;
  description: string | null;
  contactEmail: string;
}): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const { contactEmail, ...payload } = s;
    const { error } = await db
      .from("event_submissions")
      .insert({ payload, contact_email: contactEmail });
    if (error) throw new Error(error.message);
  });
}

/**
 * Evento do leitor já validado (`src/lib/events/schema.ts`): tabela `events` (ADR-008).
 * `user_id` fica nulo até existir sessão de conta no servidor (P2-T11); o IP nunca é gravado.
 */
export async function saveReaderEvent(e: {
  name: string;
  anonId: string | null;
  at: string;
  sourceId: string | null;
  contentId: string | null;
  session: { id: string; page: string; referrer: string | null; device: string };
  consent: { version: string; metrics: boolean; personalization: boolean };
  algoVersion: string;
  props: Record<string, string | number | boolean>;
}): Promise<Result<void, WriteError>> {
  return withService(async (db) => {
    const { error } = await db.from("events").insert({
      name: e.name,
      anon_id: e.anonId,
      user_id: null,
      at: e.at,
      source_slug: e.sourceId,
      content_ref: e.contentId,
      session: e.session,
      consent: e.consent,
      algo_version: e.algoVersion,
      props: e.props,
    });
    if (error) throw new Error(error.message);
  });
}
