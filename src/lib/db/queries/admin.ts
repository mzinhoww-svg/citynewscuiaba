import "server-only";
import type { AuditRow } from "@/lib/admin/audit-csv";
import type { IntegrationProbes } from "@/lib/admin/integrations";
import { SETTING_KEYS, type SettingKey } from "@/lib/admin/settings";
import type { SponsoredCampaign } from "@/lib/ads/rules";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras da Administração (P5-T9), sempre com a sessão da pessoa: a RLS decide o que aparece
 * (`audit_log`: audit.view; `site_settings`, `push_dispatches` e `sponsored_campaigns`: equipe).
 */

function must<T>(what: string, r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(`admin ${what}: ${r.error.message}`);
  return (r.data ?? ([] as unknown)) as T;
}

/* ------------------------------------------------------------------ auditoria */

export interface AuditFilters {
  actor?: string;
  action?: string;
  object?: string;
  /** AAAA-MM-DD, inclusivo. */
  from?: string;
  to?: string;
}

export const AUDIT_PAGE_SIZE = 50;

/** Escapa `%`, `_` e `\` do texto digitado antes de virar padrão de `ilike`. */
const like = (v: string) =>
  `%${v.replace(/[\\%_,()]/g, (c) => (c === "," || c === "(" || c === ")" ? " " : `\\${c}`))}%`;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function auditQuery(filters: AuditFilters, from: number, to: number): Promise<AuditRow[]> {
  const { db } = await studioContext();
  let q = db
    .from("audit_log")
    .select("id, at, actor, action, object_ref, details, ip_hash")
    .order("at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to);
  if (filters.actor) q = q.ilike("actor", like(filters.actor));
  if (filters.action) q = q.ilike("action", like(filters.action));
  if (filters.object) q = q.ilike("object_ref", like(filters.object));
  if (filters.from && DAY.test(filters.from)) q = q.gte("at", `${filters.from}T00:00:00-04:00`);
  if (filters.to && DAY.test(filters.to)) {
    const end = new Date(`${filters.to}T00:00:00-04:00`);
    end.setUTCDate(end.getUTCDate() + 1);
    q = q.lt("at", end.toISOString());
  }
  const rows = must("audit", await q);
  return rows.map((r) => ({
    id: r.id,
    at: r.at,
    actor: r.actor,
    action: r.action,
    objectRef: r.object_ref,
    details: r.details,
    ipHash: r.ip_hash,
  }));
}

/** Uma página (com uma linha a mais para saber se há a próxima). */
export async function listAudit(
  filters: AuditFilters,
  page: number,
): Promise<{ rows: AuditRow[]; hasMore: boolean }> {
  const start = (page - 1) * AUDIT_PAGE_SIZE;
  const rows = await auditQuery(filters, start, start + AUDIT_PAGE_SIZE);
  return { rows: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE };
}

export const AUDIT_EXPORT_LIMIT = 5000;

export function listAuditForExport(filters: AuditFilters): Promise<AuditRow[]> {
  return auditQuery(filters, 0, AUDIT_EXPORT_LIMIT - 1);
}

/** Nome de exibição de quem agiu (ids que não são pessoa ficam como estão). */
export async function actorNames(ids: readonly string[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids)].filter((i) => /^[0-9a-f-]{36}$/i.test(i));
  if (uuids.length === 0) return new Map();
  const { db } = await studioContext();
  const { data } = await db.from("profiles").select("id, display_name").in("id", uuids);
  return new Map((data ?? []).map((p) => [p.id, p.display_name]));
}

/* ------------------------------------------------------------------ publicidade */

export interface CampaignRow extends SponsoredCampaign {
  createdAt: string;
}

export async function listCampaigns(): Promise<CampaignRow[]> {
  const { db } = await studioContext();
  const rows = must(
    "campaigns",
    await db.from("sponsored_campaigns").select("*").order("created_at", { ascending: false }),
  );
  return rows.map((r) => {
    const c = (r.creative ?? {}) as { headline?: string; url?: string };
    return {
      id: r.id,
      advertiser: r.advertiser,
      startsOn: r.starts_on,
      endsOn: r.ends_on,
      allowedSections: r.allowed_sections,
      active: r.active,
      creative: { headline: c.headline ?? "", url: c.url ?? "" },
      createdAt: r.created_at,
    };
  });
}

export async function getFlag(key: string): Promise<boolean | null> {
  const { db } = await studioContext();
  const r = await db.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
  if (r.error) throw new Error(`admin flag: ${r.error.message}`);
  return r.data?.enabled ?? null;
}

export async function listSections(): Promise<{ slug: string; name: string }[]> {
  const { db } = await studioContext();
  const rows = must("sections", await db.from("sections").select("slug, name").order("name"));
  return rows;
}

/* ------------------------------------------------------------------ configurações */

export async function getSettings(): Promise<Partial<Record<SettingKey, string>>> {
  const { db } = await studioContext();
  const rows = must("settings", await db.from("site_settings").select("key, value"));
  const out: Partial<Record<SettingKey, string>> = {};
  for (const r of rows)
    if ((SETTING_KEYS as readonly string[]).includes(r.key)) out[r.key as SettingKey] = r.value;
  return out;
}

/** Matérias publicadas sem linha fina (descrição): páginas sem meta description. */
export async function countWithoutDescription(): Promise<{ missing: number; total: number }> {
  const { db } = await studioContext();
  const [missing, total] = await Promise.all([
    db
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "published")
      .eq("dek", ""),
    db.from("articles").select("id", { count: "exact", head: true }).eq("status", "published"),
  ]);
  if (missing.error || total.error) throw new Error("admin seo: contagem indisponível");
  return { missing: missing.count ?? 0, total: total.count ?? 0 };
}

/* ------------------------------------------------------------------ notificações */

export interface UrgentCandidate {
  id: string;
  title: string;
  publishedAt: string | null;
}

export async function listPushCandidates(): Promise<UrgentCandidate[]> {
  const { db } = await studioContext();
  const rows = must(
    "push candidates",
    await db
      .from("articles")
      .select("id, title, published_at")
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(15),
  );
  return rows.map((r) => ({ id: r.id, title: r.title, publishedAt: r.published_at }));
}

export interface PushApprovalRow {
  id: string;
  articleId: string;
  status: string;
  requestedBy: string;
  approvedBy: string | null;
  createdAt: string;
  used: boolean;
}

/** Pedidos `push.urgent` das últimas 24 h e se já foram usados num envio. */
export async function listPushApprovals(now: Date): Promise<PushApprovalRow[]> {
  const { db } = await studioContext();
  const since = new Date(now.getTime() - 24 * 3_600_000).toISOString();
  const rows = must(
    "push approvals",
    await db
      .from("approvals")
      .select("id, target_ref, status, requested_by, approved_by, created_at")
      .eq("kind", "push.urgent")
      .gte("created_at", since)
      .order("created_at", { ascending: false }),
  );
  const used = must(
    "push used",
    await db
      .from("push_dispatches")
      .select("approval_id")
      .in(
        "approval_id",
        rows.map((r) => r.id),
      ),
  );
  const usedIds = new Set(used.map((u) => u.approval_id));
  return rows.map((r) => ({
    id: r.id,
    articleId: r.target_ref,
    status: r.status,
    requestedBy: r.requested_by,
    approvedBy: r.approved_by,
    createdAt: r.created_at,
    used: usedIds.has(r.id),
  }));
}

export interface PushDispatchRow {
  id: number;
  createdAt: string;
  articleId: string;
  title: string;
  status: string;
  sentBy: string;
}

export async function listPushDispatches(limit = 20): Promise<PushDispatchRow[]> {
  const { db } = await studioContext();
  const rows = must(
    "push dispatches",
    await db
      .from("push_dispatches")
      .select("id, created_at, article_id, status, sent_by, articles(title)")
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return rows.map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    articleId: r.article_id,
    title: (r.articles as { title: string } | null)?.title ?? "",
    status: r.status,
    sentBy: r.sent_by,
  }));
}

/** E-mails (plantão e alertas) na fila `queued`: sem provedor de e-mail (B-005). */
export async function countQueuedEmails(): Promise<number> {
  const { db } = await studioContext();
  const r = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("channel", "oncall_email")
    .eq("status", "queued");
  if (r.error) throw new Error(`admin queued: ${r.error.message}`);
  return r.count ?? 0;
}

/* ------------------------------------------------------------------ segurança */

export interface SecuritySession {
  userId: string;
  name: string;
  roles: string;
  sessions: number;
  lastActive: string | null;
  lastIp: string | null;
  lastAgent: string | null;
}
export interface SecurityLimit {
  bucket: string;
  keys: number;
  hits: number;
  maxHits: number;
  lastWindow: string;
}

export async function securityOverview(): Promise<{
  sessions: SecuritySession[];
  limits: SecurityLimit[];
}> {
  const { db } = await studioContext();
  const [s, l] = await Promise.all([
    db.rpc("admin_security_sessions"),
    db.rpc("admin_security_limits"),
  ]);
  if (s.error) throw new Error(`admin security: ${s.error.message}`);
  if (l.error) throw new Error(`admin security: ${l.error.message}`);
  return {
    sessions: (s.data ?? []).map((r) => ({
      userId: r.user_id,
      name: r.display_name,
      roles: r.roles ?? "",
      sessions: r.sessions,
      lastActive: r.last_active,
      lastIp: r.last_ip,
      lastAgent: r.last_agent,
    })),
    limits: (l.data ?? []).map((r) => ({
      bucket: r.bucket,
      keys: r.keys,
      hits: Number(r.hits),
      maxHits: r.max_hits,
      lastWindow: r.last_window,
    })),
  };
}

/* ------------------------------------------------------------------ governança e integrações */

export interface GovernanceNumbers {
  pendingApprovals: number;
  activeRulesVersion: number | null;
  forceReview: boolean | null;
  flags: Record<string, boolean | null>;
}

const GOV_FLAGS = ["image_reproduction_enabled", "personalization_enabled", "sponsored_enabled"];

export async function governanceNumbers(): Promise<GovernanceNumbers> {
  const { db } = await studioContext();
  const [pending, rules, flags] = await Promise.all([
    db.from("approvals").select("id", { count: "exact", head: true }).eq("status", "pending"),
    db.from("rules").select("version, force_review").eq("active", true).maybeSingle(),
    db.from("feature_flags").select("key, enabled").in("key", GOV_FLAGS),
  ]);
  if (pending.error) throw new Error(`admin governance: ${pending.error.message}`);
  if (rules.error) throw new Error(`admin governance: ${rules.error.message}`);
  if (flags.error) throw new Error(`admin governance: ${flags.error.message}`);
  const map: Record<string, boolean | null> = Object.fromEntries(GOV_FLAGS.map((k) => [k, null]));
  for (const f of flags.data ?? []) map[f.key] = f.enabled;
  return {
    pendingApprovals: pending.count ?? 0,
    activeRulesVersion: rules.data?.version ?? null,
    forceReview: rules.data?.force_review ?? null,
    flags: map,
  };
}

export async function integrationProbes(): Promise<IntegrationProbes> {
  const { db } = await studioContext();
  const probe = await db.from("feature_flags").select("key").limit(1);
  let queued = 0;
  try {
    queued = await countQueuedEmails();
  } catch {
    queued = 0;
  }
  return { dbOk: !probe.error, queuedEmails: queued };
}
