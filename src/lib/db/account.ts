import "server-only";
import { createHash } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import type { MigrationPlan, RemoteAccountData } from "@/lib/anon/migrate";
import type { AnonProfile, FollowKind } from "@/lib/anon/types";
import { err, ok, type Result } from "@/lib/result";
import { createServiceClient, type DbClient } from "./client";
import { SupabaseEnvError } from "./env";
import type { Json } from "./types";

/**
 * Acesso a banco da conta do leitor (P2-T11/T12). Com a sessão do leitor (RLS: dono =
 * `auth.uid()`), exceto o registro de falhas de login, que fica em `rate_limits` (service role,
 * chave sempre com hash).
 */
export type AccountError = { kind: "unconfigured" | "unavailable" };

const FOLLOW_KINDS: readonly FollowKind[] = ["source", "topic", "section", "collection"];
const LOGIN_BUCKET = "login_fail";
const MINUTE = 60;

/** Chave das falhas de login: e-mail e conexão (o IP já chega com hash), nunca em claro. */
export function loginFailureKey(email: string, ipKey: string): string {
  return createHash("sha256").update(`login:${email}:${ipKey}`).digest("hex");
}

async function service<T>(fn: (db: DbClient) => Promise<T>): Promise<Result<T, AccountError>> {
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

/** Falhas dos últimos 16 minutos (uma data por falha, no início do minuto em que ocorreu). */
export async function readLoginFailures(
  key: string,
  now: Date,
): Promise<Result<Date[], AccountError>> {
  return service(async (db) => {
    const since = new Date(now.getTime() - 16 * 60_000).toISOString();
    const { data, error } = await db
      .from("rate_limits")
      .select("window_start, hits")
      .eq("bucket", LOGIN_BUCKET)
      .eq("key_hash", key)
      .gte("window_start", since);
    if (error) throw new Error(error.message);
    return (data ?? []).flatMap((r) =>
      Array.from({ length: Math.min(r.hits, 50) }, () => new Date(r.window_start)),
    );
  });
}

export async function recordLoginFailure(key: string): Promise<Result<void, AccountError>> {
  return service(async (db) => {
    const { error } = await db.rpc("hit_rate_limit", {
      p_bucket: LOGIN_BUCKET,
      p_key_hash: key,
      p_limit: 1_000_000,
      p_window_seconds: MINUTE,
    });
    if (error) throw new Error(error.message);
  });
}

export async function clearLoginFailures(key: string): Promise<Result<void, AccountError>> {
  return service(async (db) => {
    const { error } = await db
      .from("rate_limits")
      .delete()
      .eq("bucket", LOGIN_BUCKET)
      .eq("key_hash", key);
    if (error) throw new Error(error.message);
  });
}

/** Nome de exibição guardado no cadastro (metadados do Auth) ou a parte local do e-mail. */
export function displayNameOf(user: Pick<User, "email" | "user_metadata">): string {
  const meta = user.user_metadata as Record<string, unknown> | undefined;
  const name = [meta?.display_name, meta?.full_name, meta?.name].find(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  return (name ?? user.email?.split("@")[0] ?? "Leitor").trim().slice(0, 80);
}

/** Cria o perfil do leitor na primeira sessão (RLS: `profiles_insert_self`). Idempotente. */
export async function ensureProfile(db: DbClient, user: User): Promise<void> {
  const { data } = await db.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (data) return;
  await db
    .from("profiles")
    .upsert(
      { id: user.id, display_name: displayNameOf(user) },
      { onConflict: "id", ignoreDuplicates: true },
    );
}

/** O que a conta já tem, para a migração não duplicar (C06). */
export async function readRemoteAccountData(
  db: DbClient,
  userId: string,
): Promise<RemoteAccountData> {
  const [follows, saved, alerts, collections] = await Promise.all([
    db.from("follows").select("target_kind, target_id").eq("owner_ref", userId),
    db.from("saved_items").select("content_ref").eq("owner_ref", userId),
    db.from("alerts").select("target_kind, target_id, channel").eq("owner_ref", userId),
    db.from("collections").select("title").eq("owner_ref", userId).eq("is_editorial", false),
  ]);
  for (const r of [follows, saved, alerts, collections])
    if (r.error) throw new Error(r.error.message);
  const f = follows.data ?? [];
  return {
    follows: f.filter((x) => x.target_kind === "source").map((x) => x.target_id),
    otherFollows: f.flatMap((x) => {
      const kind = FOLLOW_KINDS.find((k) => k === x.target_kind);
      return kind && kind !== "source" ? [{ kind, id: x.target_id }] : [];
    }),
    saved: (saved.data ?? []).map((s) => s.content_ref),
    alerts: (alerts.data ?? []).map((a) => ({
      kind: a.target_kind,
      target: a.target_id,
      channel: a.channel === "email" ? "email" : "browser",
    })),
    collections: (collections.data ?? []).map((c) => c.title),
  };
}

type Preferences = {
  interests?: AnonProfile["interests"];
  hidden?: MigrationPlan["hidden"];
  history?: AnonProfile["history"];
};

function asPreferences(v: Json | undefined): Preferences {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Preferences) : {};
}

/**
 * Grava o plano da migração na conta, sem duplicar (a chave primária de seguidas e salvos
 * também protege contra dois cliques). Interesses, ocultações e histórico escolhidos vão para
 * `reader_preferences` (só o leitor lê, 0020), somados ao que a conta já tinha.
 */
export async function applyMigration(
  db: DbClient,
  userId: string,
  plan: MigrationPlan,
  local: AnonProfile,
): Promise<void> {
  const owner = userId;
  const follows = [
    ...plan.follows.map((id) => ({ owner_ref: owner, target_kind: "source", target_id: id })),
    ...plan.otherFollows.map((f) => ({ owner_ref: owner, target_kind: f.kind, target_id: f.id })),
  ];
  if (follows.length) {
    const { error } = await db
      .from("follows")
      .upsert(follows, { onConflict: "owner_ref,target_kind,target_id", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  if (plan.saved.length) {
    const { error } = await db.from("saved_items").upsert(
      plan.saved.map((s) => ({
        owner_ref: owner,
        content_ref: s.ref,
        progress: Math.round(Math.min(100, Math.max(0, s.progress))) / 100,
      })),
      { onConflict: "owner_ref,content_ref", ignoreDuplicates: true },
    );
    if (error) throw new Error(error.message);
  }
  if (plan.alerts.length) {
    const { error } = await db.from("alerts").insert(
      plan.alerts.map((a) => ({
        owner_ref: owner,
        target_kind: a.kind,
        target_id: a.target,
        frequency: a.frequency,
        channel: a.channel,
        active: true,
      })),
    );
    if (error) throw new Error(error.message);
  }
  if (plan.collections.length) {
    // Todas as coleções numa inserção e todos os itens noutra (antes, duas chamadas por coleção).
    const created = plan.collections.map((c) => ({
      slug: `pessoal-${crypto.randomUUID()}`,
      title: c.name.slice(0, 80),
      items: [...new Set(c.items)].slice(0, 500),
    }));
    const { data, error } = await db
      .from("collections")
      .insert(
        created.map((c) => ({
          slug: c.slug,
          title: c.title,
          description: "",
          owner_ref: owner,
          is_editorial: false,
        })),
      )
      .select("id, slug");
    if (error) throw new Error(error.message);
    const idBySlug = new Map((data ?? []).map((r) => [r.slug, r.id]));
    const items = created.flatMap((c) => {
      const collectionId = idBySlug.get(c.slug);
      if (!collectionId) throw new Error(`coleção não gravada: ${c.slug}`);
      return c.items.map((ref, position) => ({
        collection_id: collectionId,
        content_ref: ref,
        position,
      }));
    });
    if (items.length) {
      const { error: e2 } = await db.from("collection_items").insert(items);
      if (e2) throw new Error(e2.message);
    }
  }

  if (plan.interests.length === 0 && plan.hidden.length === 0 && plan.history === 0) return;
  const { data: profile, error: pe } = await db
    .from("reader_preferences")
    .select("preferences")
    .eq("user_id", owner)
    .maybeSingle();
  if (pe) throw new Error(pe.message);
  const prev = asPreferences(profile?.preferences);
  const keys = new Set(plan.interests);
  const interests = [
    ...(prev.interests ?? []).filter((i) => !keys.has(i.key)),
    ...local.interests.filter((i) => keys.has(i.key)),
  ].slice(0, 200);
  const hiddenSlugs = new Set(plan.hidden.map((h) => h.sourceSlug));
  const hidden = [
    ...(prev.hidden ?? []).filter((h) => !hiddenSlugs.has(h.sourceSlug)),
    ...plan.hidden,
  ].slice(0, 500);
  const history =
    plan.history > 0
      ? [...local.history, ...(prev.history ?? [])].slice(0, 1000)
      : (prev.history ?? []);
  const preferences = { ...prev, interests, hidden, history } as unknown as {
    [key: string]: Json;
  };
  const { error: ue } = await db.from("reader_preferences").upsert(
    {
      user_id: owner,
      preferences,
      updated_at: new Date().toISOString(),
      ...(local.anonId && plan.history > 0 ? { migrated_from_anon: local.anonId } : {}),
    },
    { onConflict: "user_id" },
  );
  if (ue) throw new Error(ue.message);
}

/** Perfil da conta para /perfil (RLS: só o próprio). `null` se ainda não existe. */
export async function readAccountProfile(db: DbClient, userId: string) {
  const [profile, roles] = await Promise.all([
    db
      .from("profiles")
      .select("display_name, neighborhood, delete_requested_at, created_at")
      .eq("id", userId)
      .maybeSingle(),
    db.from("user_roles").select("role").eq("user_id", userId),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  return profile.data
    ? {
        displayName: profile.data.display_name,
        neighborhood: profile.data.neighborhood,
        deleteRequestedAt: profile.data.delete_requested_at,
        createdAt: profile.data.created_at,
        staff: (roles.data ?? []).length > 0,
      }
    : null;
}

type Row = Record<string, Json>;
/** Resultado de `export_email_data` (0021). */
export interface EmailData {
  newsletter: Row[];
  alerts: Row[];
  emails: Row[];
}

/** Cópia dos dados da conta (P20, LGPD): tudo o que é do leitor, sem dados de outras pessoas. */
export async function exportAccount(db: DbClient, user: User) {
  const owner = user.id;
  const [profile, prefs, follows, saved, alerts, collections, byEmail, push] = await Promise.all([
    db
      .from("profiles")
      .select("display_name, neighborhood, created_at, delete_requested_at")
      .eq("id", owner)
      .maybeSingle(),
    db
      .from("reader_preferences")
      .select("preferences, migrated_from_anon, updated_at")
      .eq("user_id", owner)
      .maybeSingle(),
    db.from("follows").select("target_kind, target_id, created_at").eq("owner_ref", owner),
    db.from("saved_items").select("content_ref, progress, created_at").eq("owner_ref", owner),
    db
      .from("alerts")
      .select("target_kind, target_id, frequency, channel, active")
      .eq("owner_ref", owner),
    db
      .from("collections")
      .select("title, description, collection_items(content_ref, position)")
      .eq("owner_ref", owner)
      .eq("is_editorial", false),
    // Guardado pelo e-mail da conta (newsletter, alertas por e-mail, fila): gate P2, I5.
    db.rpc("export_email_data"),
    // Inscrições de push desta conta (spec 2026-09-28 §14): sem endpoint nem chaves.
    db
      .from("my_push_subscriptions")
      .select(
        "browser, device_class, platform, installed, want_follow, want_urgent, want_highlight, targets, quiet_start, quiet_end, daily_limit, metrics_consent, created_at, last_seen_at",
      ),
  ]);
  for (const r of [profile, prefs, follows, saved, alerts, collections, byEmail, push])
    if (r.error) throw new Error(r.error.message);
  return {
    exportedAt: new Date().toISOString(),
    account: { email: user.email, createdAt: user.created_at, lastSignInAt: user.last_sign_in_at },
    profile: profile.data,
    preferences: prefs.data,
    follows: follows.data,
    saved: saved.data,
    alerts: alerts.data,
    collections: collections.data,
    byEmail: byEmail.data as EmailData | null,
    pushSubscriptions: push.data,
  };
}
