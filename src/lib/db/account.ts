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
 * `profiles.preferences`, somados ao que a conta já tinha.
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
  for (const c of plan.collections) {
    const { data, error } = await db
      .from("collections")
      .insert({
        slug: `pessoal-${crypto.randomUUID()}`,
        title: c.name.slice(0, 80),
        description: "",
        owner_ref: owner,
        is_editorial: false,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (c.items.length) {
      const { error: e2 } = await db.from("collection_items").insert(
        [...new Set(c.items)].slice(0, 500).map((ref, position) => ({
          collection_id: data.id,
          content_ref: ref,
          position,
        })),
      );
      if (e2) throw new Error(e2.message);
    }
  }

  const { data: profile, error: pe } = await db
    .from("profiles")
    .select("preferences")
    .eq("id", owner)
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
  const { error: ue } = await db
    .from("profiles")
    .update({
      preferences,
      ...(local.anonId && plan.history > 0 ? { migrated_from_anon: local.anonId } : {}),
    })
    .eq("id", owner);
  if (ue) throw new Error(ue.message);
}
