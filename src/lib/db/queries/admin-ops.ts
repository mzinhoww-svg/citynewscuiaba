import "server-only";
import { presentAuditRow, type AuditFilters, type AuditRow } from "@/lib/admin/audit-export";
import { isRole } from "@/lib/admin/roles";
import type { Campaign } from "@/lib/ads/rules";
import type { RoleGrant } from "@/lib/auth/permissions";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import type { Json } from "@/lib/db/types";
import { studioContext } from "@/lib/studio/context";
import { PUBLIC_STATUSES } from "./articles";
import { readService } from "./run";

/*
 * Leituras da Administração, parte 2 (A07, A08, A10–A14, P5-T9), com a sessão da pessoa.
 * Exceções: contagens da governança (agregados sem dado pessoal, `readService`) e, na revisão de
 * acessos, e-mail, último acesso e 2FA vindos do Auth (service role, rota guardada por
 * `users.manage`).
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`admin ${what}: ${error.message}`);
}

async function names(db: DbClient, ids: (string | null | undefined)[]) {
  const uuids = [...new Set(ids.filter((i): i is string => /^[0-9a-f-]{36}$/i.test(i ?? "")))];
  if (uuids.length === 0) return new Map<string, string>();
  const { data, error } = await db.from("profiles").select("id, display_name").in("id", uuids);
  check("profiles", error);
  return new Map((data ?? []).map((r) => [r.id, r.display_name]));
}

// ---------------------------------------------------------------------------
// Publicidade
// ---------------------------------------------------------------------------
export interface CampaignRow extends Campaign {
  deliveries: number;
  createdAt: string;
}

function creativeOf(v: Json): Campaign["creative"] {
  const o = (v && typeof v === "object" && !Array.isArray(v) ? v : {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" ? (o[k] as string) : undefined);
  return {
    title: s("title") ?? "",
    href: s("href") ?? "",
    ...(s("imageUrl") ? { imageUrl: s("imageUrl")! } : {}),
    ...(s("imageAlt") ? { imageAlt: s("imageAlt")! } : {}),
  };
}

export async function listCampaigns(db?: DbClient): Promise<CampaignRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("sponsored_campaigns")
    .select(
      "id, advertiser, starts_on, ends_on, allowed_sections, creative, status, deliveries, updated_at",
    )
    .order("starts_on", { ascending: false });
  check("campaigns", error);
  return (data ?? []).map((r) => ({
    id: r.id,
    advertiser: r.advertiser,
    startsOn: r.starts_on,
    endsOn: r.ends_on,
    allowedSections: r.allowed_sections,
    creative: creativeOf(r.creative),
    status: (["draft", "active", "paused", "ended"].includes(r.status)
      ? r.status
      : "draft") as Campaign["status"],
    deliveries: r.deliveries,
    createdAt: r.updated_at,
  }));
}

// ---------------------------------------------------------------------------
// SEO
// ---------------------------------------------------------------------------
export interface RedirectRow {
  id: string;
  fromPath: string;
  toPath: string;
  kind: 301 | 302;
  reason: string;
  createdAt: string;
}
export interface SeoOverview {
  titleTemplate: string;
  redirects: RedirectRow[];
  missingDescription: { id: string; slug: string; title: string; publishedAt: string | null }[];
  missingCount: number;
}

export async function listRedirects(db: DbClient): Promise<RedirectRow[]> {
  const { data, error } = await db
    .from("redirects")
    .select("id, from_path, to_path, kind, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  check("redirects", error);
  return (data ?? []).map((r) => ({
    id: r.id,
    fromPath: r.from_path,
    toPath: r.to_path,
    kind: r.kind === 302 ? 302 : 301,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export async function seoOverview(db?: DbClient): Promise<SeoOverview> {
  const client = db ?? (await studioContext()).db;
  const [setting, redirects, missing] = await Promise.all([
    client.from("app_settings").select("value").eq("key", "seo.title_template").maybeSingle(),
    listRedirects(client),
    client
      .from("articles")
      .select("id, slug, title, published_at", { count: "exact" })
      .in("status", [...PUBLIC_STATUSES])
      .or("seo_description.is.null,seo_description.eq.")
      .order("published_at", { ascending: false })
      .limit(50),
  ]);
  check("setting", setting.error);
  check("missing", missing.error);
  const v = setting.data?.value;
  return {
    titleTemplate: typeof v === "string" ? v : "{title} · CityNews Cuiabá",
    redirects,
    missingDescription: (missing.data ?? []).map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      publishedAt: a.published_at,
    })),
    missingCount: missing.count ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Auditoria
// ---------------------------------------------------------------------------
export async function searchAudit(
  filters: AuditFilters,
  opts: { limit: number; maskIp: boolean; before?: number },
  db?: DbClient,
): Promise<AuditRow[]> {
  const client = db ?? (await studioContext()).db;
  let q = client
    .from("audit_log_view")
    .select("id, at, actor, action, object_ref, details, ip_hash");
  if (filters.action) q = q.ilike("action", `${filters.action.replace(/[%_]/g, "")}%`);
  if (filters.object) q = q.ilike("object_ref", `%${filters.object.replace(/[%_]/g, "")}%`);
  if (filters.from) q = q.gte("at", `${filters.from}T00:00:00-04:00`);
  if (filters.to) q = q.lte("at", `${filters.to}T23:59:59-04:00`);
  if (opts.before) q = q.lt("id", opts.before);
  if (filters.actor) {
    if (/^[0-9a-f-]{36}$/i.test(filters.actor)) q = q.eq("actor", filters.actor);
    else {
      const { data: people } = await client
        .from("profiles")
        .select("id")
        .ilike("display_name", `%${filters.actor.replace(/[%_]/g, "")}%`)
        .limit(50);
      const ids = (people ?? []).map((p) => p.id);
      q = ids.length ? q.in("actor", ids) : q.eq("actor", filters.actor);
    }
  }
  const { data, error } = await q.order("id", { ascending: false }).limit(opts.limit).returns<
    {
      id: number;
      at: string;
      actor: string;
      action: string;
      object_ref: string;
      details: unknown;
      ip_hash: string | null;
    }[]
  >();
  check("audit", error);
  const people = await names(
    client,
    (data ?? []).map((r) => r.actor),
  );
  return (data ?? []).map((r) =>
    presentAuditRow(
      {
        id: r.id,
        at: r.at,
        actor: r.actor,
        actorName: people.get(r.actor) ?? null,
        action: r.action,
        objectRef: r.object_ref,
        details: r.details,
        ipHash: r.ip_hash,
      },
      opts,
    ),
  );
}

// ---------------------------------------------------------------------------
// Segurança
// ---------------------------------------------------------------------------
export interface PrivacyRequestRow {
  id: string;
  kind: "access" | "delete" | "rectify" | "portability";
  email: string;
  notes: string;
  status: "open" | "in_progress" | "done" | "rejected";
  dueAt: string;
  createdAt: string;
}
export interface AccessRow {
  id: string;
  name: string;
  roles: RoleGrant[];
  lastSignInAt: string | null;
  mfa: boolean | null;
}
export interface KeyRow {
  key: string;
  label: string;
  integration: string;
  rotateEveryDays: number;
  rotatedAt: string | null;
  rotatedBy: string | null;
}
export interface SecurityOverview {
  settings: { require2fa: boolean; sessionHours: number; retentionDays: number };
  requests: PrivacyRequestRow[];
  access: AccessRow[];
  keys: KeyRow[];
}

export async function securityOverview(): Promise<SecurityOverview> {
  const { db } = await studioContext();
  const [settings, requests, people, roles, keys] = await Promise.all([
    db.from("app_settings").select("key, value").like("key", "security.%"),
    db
      .from("privacy_requests")
      .select("id, kind, email, notes, status, due_at, created_at")
      .order("due_at")
      .limit(200),
    db.rpc("studio_people"),
    db.from("user_roles").select("user_id, role, sections"),
    db
      .from("integration_keys")
      .select("key, label, integration, rotate_every_days, rotated_at, rotated_by")
      .order("integration"),
  ]);
  check("settings", settings.error);
  check("privacy", requests.error);
  check("people", people.error);
  check("roles", roles.error);
  check("keys", keys.error);
  const val = (k: string) => settings.data?.find((s) => s.key === k)?.value;
  const auth = new Map<string, { last: string | null; mfa: boolean }>();
  try {
    const { data } = await createServiceClient().auth.admin.listUsers({ page: 1, perPage: 500 });
    for (const u of data?.users ?? [])
      auth.set(u.id, {
        last: u.last_sign_in_at ?? null,
        mfa: (u.factors ?? []).some((f) => f.status === "verified"),
      });
  } catch {
    // Sem service role, a revisão de acessos fica sem último acesso e 2FA.
  }
  const rolesOf = new Map<string, RoleGrant[]>();
  for (const r of roles.data ?? []) {
    if (!isRole(r.role)) continue;
    rolesOf.set(r.user_id, [
      ...(rolesOf.get(r.user_id) ?? []),
      { role: r.role, sections: r.sections },
    ]);
  }
  const rotators = await names(
    db,
    (keys.data ?? []).map((k) => k.rotated_by),
  );
  return {
    settings: {
      require2fa: val("security.require_2fa") === true,
      sessionHours: Number(val("security.session_hours") ?? 12),
      retentionDays: Number(val("security.retention_days") ?? 365),
    },
    requests: (requests.data ?? []).map((r) => ({
      id: r.id,
      kind: r.kind as PrivacyRequestRow["kind"],
      email: r.email,
      notes: r.notes,
      status: r.status as PrivacyRequestRow["status"],
      dueAt: r.due_at,
      createdAt: r.created_at,
    })),
    access: (people.data ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      roles: rolesOf.get(p.id) ?? [],
      lastSignInAt: auth.get(p.id)?.last ?? null,
      mfa: auth.has(p.id) ? auth.get(p.id)!.mfa : null,
    })),
    keys: (keys.data ?? []).map((k) => ({
      key: k.key,
      label: k.label,
      integration: k.integration,
      rotateEveryDays: k.rotate_every_days,
      rotatedAt: k.rotated_at,
      rotatedBy: k.rotated_by ? (rotators.get(k.rotated_by) ?? null) : null,
    })),
  };
}

// ---------------------------------------------------------------------------
// Governança editorial
// ---------------------------------------------------------------------------
export interface GovernanceOverview {
  correctionsOpen: number;
  correctionsOverdue: number;
  rightOfReplyOpen: number;
  reportsOpen: number;
  approvalsPending: number;
  publishedHuman7d: number;
  publishedAuto7d: number;
  correctionsPublished30d: number;
}

export async function governanceOverview(now = new Date()): Promise<GovernanceOverview> {
  const r = await readService(async (db) => {
    const nowIso = now.toISOString();
    const d7 = new Date(now.getTime() - 7 * 86400_000).toISOString();
    const d30 = new Date(now.getTime() - 30 * 86400_000).toISOString();
    const count = async (
      q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
    ) => {
      const { count: n, error } = await q;
      check("governance", error);
      return n ?? 0;
    };
    const head = { count: "exact" as const, head: true };
    const [
      correctionsOpen,
      correctionsOverdue,
      rightOfReplyOpen,
      reportsOpen,
      approvalsPending,
      human,
      auto,
      corrected,
    ] = await Promise.all([
      count(db.from("corrections").select("id", head).eq("status", "open")),
      count(db.from("corrections").select("id", head).eq("status", "open").lt("due_at", nowIso)),
      count(
        db.from("reports").select("id", head).eq("status", "open").eq("kind", "right_of_reply"),
      ),
      count(db.from("reports").select("id", head).eq("status", "open")),
      count(db.from("approvals").select("id", head).eq("status", "pending")),
      count(
        db
          .from("articles")
          .select("id", head)
          .in("status", [...PUBLIC_STATUSES])
          .eq("publish_mode", "human")
          .gte("published_at", d7),
      ),
      count(
        db
          .from("articles")
          .select("id", head)
          .in("status", [...PUBLIC_STATUSES])
          .eq("publish_mode", "auto")
          .gte("published_at", d7),
      ),
      count(db.from("corrections").select("id", head).gte("published_at", d30)),
    ]);
    return {
      correctionsOpen,
      correctionsOverdue,
      rightOfReplyOpen,
      reportsOpen,
      approvalsPending,
      publishedHuman7d: human,
      publishedAuto7d: auto,
      correctionsPublished30d: corrected,
    };
  });
  if (!r.ok) throw new Error(`governance: ${r.error.kind}`);
  return r.value;
}

// ---------------------------------------------------------------------------
// Integrações e configurações
// ---------------------------------------------------------------------------
export interface IntegrationRow {
  id: "supabase" | "openrouter" | "vercel" | "cron" | "media" | "email" | "push";
  status: "configured" | "missing" | "degraded";
  detail: string[];
}

export async function integrationsOverview(
  env: NodeJS.ProcessEnv = process.env,
  text: {
    fake: string;
    models: (n: number) => string;
    lastRun: (w: string) => string;
    noRun: string;
    lastCall: (w: string) => string;
    noCall: string;
    store: (k: string) => string;
    viaAuth: string;
    pwa: string;
    env: (n: string) => string;
    local: string;
  },
  fmt: (iso: string) => string,
): Promise<IntegrationRow[]> {
  const { db } = await studioContext();
  const [models, run, call] = await Promise.all([
    db.from("ai_models").select("id", { count: "exact", head: true }).eq("status", "active"),
    db
      .from("ingest_runs")
      .select("started_at")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("ai_calls")
      .select("created_at")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const has = (k: string) => Boolean(env[k]);
  const fake = env.AI_PROVIDER === "fake";
  const models_n = models.count ?? 0;
  return [
    {
      id: "supabase",
      status:
        has("NEXT_PUBLIC_SUPABASE_URL") && has("SUPABASE_SERVICE_ROLE_KEY")
          ? "configured"
          : "missing",
      detail: [run.data?.started_at ? text.lastRun(fmt(run.data.started_at)) : text.noRun],
    },
    {
      id: "openrouter",
      status: fake ? "degraded" : has("OPENROUTER_API_KEY") ? "configured" : "missing",
      detail: [
        fake ? text.fake : text.models(models_n),
        call.data?.created_at ? text.lastCall(fmt(call.data.created_at)) : text.noCall,
      ],
    },
    {
      id: "vercel",
      status: has("VERCEL_ENV") ? "configured" : "degraded",
      detail: [env.VERCEL_ENV ? text.env(env.VERCEL_ENV) : text.local],
    },
    { id: "cron", status: has("CRON_SECRET") ? "configured" : "missing", detail: [] },
    {
      id: "media",
      status: has("MEDIA_STORE") ? "configured" : "degraded",
      detail: [text.store(env.MEDIA_STORE ?? "local")],
    },
    { id: "email", status: "configured", detail: [text.viaAuth] },
    {
      id: "push",
      status:
        has("WEB_PUSH_PUBLIC_KEY") || has("NEXT_PUBLIC_VAPID_PUBLIC_KEY")
          ? "configured"
          : "degraded",
      detail: [text.pwa],
    },
  ];
}

export interface SettingRow {
  key: string;
  value: Json;
  updatedAt: string;
  updatedBy: string | null;
}

export async function listSettings(): Promise<SettingRow[]> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("app_settings")
    .select("key, value, updated_at, updated_by")
    .order("key");
  check("settings", error);
  const people = await names(
    db,
    (data ?? []).map((s) => s.updated_by),
  );
  return (data ?? []).map((s) => ({
    key: s.key,
    value: s.value,
    updatedAt: s.updated_at,
    updatedBy: s.updated_by ? (people.get(s.updated_by) ?? null) : null,
  }));
}
