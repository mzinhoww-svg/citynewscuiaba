import "server-only";
import { canAccess, type RoleGrant } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { createServerClient, createServiceClient, type DbClient } from "@/lib/db/client";
import { SupabaseEnvError } from "@/lib/db/env";
import type { Database, Json } from "@/lib/db/types";
import { missingVapidVars } from "@/lib/push/server";
import type { audienceSchema } from "@/lib/push/schemas";
import type { PushKind, SendStatus } from "@/lib/push/types";
import type { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import { many, one } from "./run";
import type { QueryError } from "./types";

/**
 * Leituras de A09 (spec 2026-09-28 §10). Cada leitura usa o cliente com a sessão da pessoa (RLS
 * de `push_sends`: quem aprova ou configura vê tudo; editor vê os próprios pedidos e os da
 * editoria). Entregas e contadores não têm política para pessoa: são lidos com service role só
 * depois de a sessão enxergar o envio. Nenhuma leitura devolve dado de inscrição (endpoint,
 * chaves, token, alvos de uma pessoa). Todas devolvem `Result` e nunca lançam.
 */

type SendRow = Database["public"]["Tables"]["push_sends"]["Row"];
/** Público de um pedido (spec §10.2): todos, editoria ou bairro. */
export type AdminAudience = z.infer<typeof audienceSchema>;

export const HISTORY_PAGE_SIZE = 50;

export interface PersonRef {
  id: string;
  name: string;
}

export interface ArticleRef {
  id: string;
  slug: string;
  title: string;
  sectionSlug: string;
  sectionName: string;
  /** `null` quando a matéria saiu do ar (arquivada/despublicada). */
  publishedAt: string | null;
}

export interface QueueRow {
  id: string;
  kind: PushKind;
  status: SendStatus;
  statusReason: string | null;
  title: string;
  body: string;
  originLabel: string;
  audience: AdminAudience;
  audienceLabel: string;
  /** Alcance estimado (D-P24) para pedidos ainda não despachados; `null` sem estimativa. */
  reach: number | null;
  article: ArticleRef;
  requestedBy: PersonRef | null;
  requestedAt: string;
  approvedBy: PersonRef | null;
  approvedAt: string | null;
  scheduledAt: string | null;
  justification: string | null;
  version: number;
}

export interface HistoryRow {
  id: string;
  kind: PushKind;
  status: SendStatus;
  article: ArticleRef;
  title: string;
  audienceLabel: string;
  requestedBy: PersonRef | null;
  approvedBy: PersonRef | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  targets: number;
  sent: number;
  accepted: number;
  failed: number;
  removed: number;
  skipped: number;
  /** Recebidos e tocados só entre quem permite métricas. */
  delivered: number;
  clicked: number;
  /** tocados ÷ recebidos (0–1), `null` sem recebidos. */
  ctr: number | null;
}

export interface HistoryFilter {
  /** Dias para trás (7, 30, 90) ou `null` para tudo. */
  days: 7 | 30 | 90 | null;
  kind: PushKind | null;
  status: SendStatus | null;
  page: number;
}

export interface HistoryDetail extends HistoryRow {
  body: string;
  originLabel: string;
  statusReason: string | null;
  justification: string | null;
  scheduledAt: string | null;
  approvedAt: string | null;
  timeline: { at: string; label: TimelineLabel; by: string | null }[];
  skips: { reason: string; n: number }[];
  failures: { code: string; n: number }[];
  byDevice: { device: string; browser: string; sent: number; delivered: number; clicked: number }[];
}

export type TimelineLabel =
  | "requested"
  | "approved"
  | "rejected"
  | "cancelled"
  | "expired"
  | "started"
  | "finished"
  | "paused";

export interface ArticleOption extends ArticleRef {
  dek: string;
  originLabel: string;
  urgent: boolean;
}

export interface PushTemplate {
  name: string;
  title: string;
  body: string;
}

export interface PushSettingsView {
  dailyLimit: number;
  quietStart: number;
  quietEnd: number;
  templates: PushTemplate[];
  paused: { on: boolean; by: PersonRef | null; at: string | null; reason: string | null };
  vapid: { ok: boolean; missing: string[] };
}

const KINDS: readonly PushKind[] = ["urgent", "highlight", "follow"];
const STATUSES: readonly SendStatus[] = [
  "pending_approval",
  "scheduled",
  "queued",
  "dispatching",
  "sent",
  "paused",
  "cancelled",
  "rejected",
  "expired",
];
const DAYS = [7, 30, 90] as const;

const pick = <T extends string>(list: readonly T[], v: string | null): T | null =>
  v !== null && (list as readonly string[]).includes(v) ? (v as T) : null;

/** Filtros do histórico na URL (`periodo`, `tipo`, `estado`, `pagina`); inválidos ignorados. */
export function parseHistoryFilter(sp: URLSearchParams): HistoryFilter {
  const daysN = Number(sp.get("periodo"));
  const page = Number(sp.get("pagina"));
  return {
    days: (DAYS as readonly number[]).includes(daysN)
      ? (daysN as 7 | 30 | 90)
      : sp.get("periodo") === "tudo"
        ? null
        : 30,
    kind: pick(KINDS, sp.get("tipo")),
    status: pick(STATUSES, sp.get("estado")),
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

// ---------------------------------------------------------------------------
// Apoio
// ---------------------------------------------------------------------------

async function sessionDb(): Promise<
  Result<{ db: DbClient; roles: RoleGrant[]; userId: string }, QueryError>
> {
  try {
    const session = await getSession();
    if (!session) return err({ kind: "unavailable", message: "sem sessão" });
    const db = await createServerClient();
    return ok({ db, roles: session.roles, userId: session.userId });
  } catch (e) {
    if (e instanceof SupabaseEnvError) return err({ kind: "unconfigured" });
    return err({ kind: "unavailable", message: e instanceof Error ? e.message : String(e) });
  }
}

async function read<T>(fn: (db: DbClient, roles: RoleGrant[], userId: string) => Promise<T>) {
  const s = await sessionDb();
  if (!s.ok) return s;
  try {
    return ok(await fn(s.value.db, s.value.roles, s.value.userId));
  } catch (e) {
    return err<QueryError>({
      kind: "unavailable",
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

async function namesOf(db: DbClient, ids: (string | null)[]): Promise<Map<string, string>> {
  const uuids = [...new Set(ids.filter((i): i is string => !!i && /^[0-9a-f-]{36}$/i.test(i)))];
  if (uuids.length === 0) return new Map();
  const rows = many(await db.from("profiles").select("id, display_name").in("id", uuids));
  return new Map(rows.map((r) => [r.id, r.display_name]));
}

async function articlesOf(db: DbClient, ids: string[]): Promise<Map<string, ArticleRef>> {
  const uuids = [...new Set(ids)];
  if (uuids.length === 0) return new Map();
  const [rows, sections] = await Promise.all([
    many(
      await db
        .from("articles")
        .select("id, slug, title, section_slug, status, published_at")
        .in("id", uuids),
    ),
    many(await db.from("sections").select("slug, name")),
  ]);
  const sectionName = new Map(sections.map((s) => [s.slug, s.name]));
  return new Map(
    rows.map((a) => [
      a.id,
      {
        id: a.id,
        slug: a.slug,
        title: a.title,
        sectionSlug: a.section_slug,
        sectionName: sectionName.get(a.section_slug) ?? a.section_slug,
        publishedAt: a.status === "published" || a.status === "updated" ? a.published_at : null,
      },
    ]),
  );
}

async function sectionNames(db: DbClient): Promise<Map<string, string>> {
  const rows = many(await db.from("sections").select("slug, name"));
  return new Map(rows.map((x) => [x.slug, x.name]));
}

const person = (names: Map<string, string>, id: string | null): PersonRef | null =>
  id ? { id, name: names.get(id) ?? "Ex-integrante da redação" } : null;

function parseAudience(raw: Json): AdminAudience {
  const o = (raw ?? {}) as { type?: string; slug?: string };
  if ((o.type === "section" || o.type === "bairro") && typeof o.slug === "string")
    return { type: o.type, slug: o.slug };
  return { type: "all" };
}

const AUDIENCE_LABEL = {
  all: (kind: PushKind) =>
    kind === "urgent"
      ? "Todos que ativaram Urgentes"
      : kind === "highlight"
        ? "Todos que ativaram Destaques"
        : "Quem segue a matéria",
  section: (name: string) => `Editoria: ${name}`,
  bairro: (name: string) => `Bairro: ${name}`,
};

function audienceLabel(kind: PushKind, a: AdminAudience, sections: Map<string, string>): string {
  if (a.type === "all") return AUDIENCE_LABEL.all(kind);
  if (a.type === "section") return AUDIENCE_LABEL.section(sections.get(a.slug) ?? a.slug);
  return AUDIENCE_LABEL.bairro(NEIGHBORHOODS.find((n) => n.slug === a.slug)?.name ?? a.slug);
}

const asKind = (k: string): PushKind =>
  KINDS.includes(k as PushKind) ? (k as PushKind) : "highlight";
const asStatus = (s: string): SendStatus =>
  STATUSES.includes(s as SendStatus) ? (s as SendStatus) : "cancelled";

const ACTIVE: readonly SendStatus[] = [
  "pending_approval",
  "queued",
  "scheduled",
  "dispatching",
  "paused",
];

// ---------------------------------------------------------------------------
// Contagem para o menu e o cabeçalho
// ---------------------------------------------------------------------------

/** Pedidos aguardando aprovação visíveis à pessoa (0 sem sessão ou sem banco: nunca lança). */
export async function pendingCount(): Promise<number> {
  const r = await read(async (db) => {
    const { count, error } = await db
      .from("push_sends")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_approval");
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
  return r.ok ? r.value : 0;
}

// ---------------------------------------------------------------------------
// Fila (§10.3)
// ---------------------------------------------------------------------------

export interface QueueFilter {
  /** `pending` só aguardando aprovação; `all` tudo que ainda não terminou. */
  only?: "pending" | "all";
}

export async function queueRows(filter: QueueFilter = {}): Promise<Result<QueueRow[], QueryError>> {
  return read(async (db) => {
    let q = db
      .from("push_sends")
      .select("*")
      .neq("kind", "follow")
      .order("created_at", { ascending: false })
      .limit(200);
    q =
      filter.only === "pending" ? q.eq("status", "pending_approval") : q.in("status", [...ACTIVE]);
    const rows = many<SendRow>(await q);
    const [names, articles, sections] = await Promise.all([
      namesOf(
        db,
        rows.flatMap((r) => [r.requested_by, r.approved_by]),
      ),
      articlesOf(
        db,
        rows.map((r) => r.article_id),
      ),
      sectionNames(db),
    ]);
    const estimates = await Promise.all(
      rows.map(async (r) => {
        if (r.status !== "pending_approval" && r.status !== "scheduled" && r.status !== "queued")
          return null;
        const { data } = await db.rpc("push_audience_estimate", {
          p_kind: r.kind,
          p_audience: r.audience,
        });
        return typeof data === "number" ? data : null;
      }),
    );
    return rows.map((r, i) => {
      const kind = asKind(r.kind);
      const audience = parseAudience(r.audience);
      return {
        id: r.id,
        kind,
        status: asStatus(r.status),
        statusReason: r.status_reason,
        title: r.title,
        body: r.body,
        originLabel: r.origin_label,
        audience,
        audienceLabel: audienceLabel(kind, audience, sections),
        reach: estimates[i] ?? null,
        article: articles.get(r.article_id) ?? missingArticle(r.article_id),
        requestedBy: person(names, r.requested_by),
        requestedAt: r.created_at,
        approvedBy: person(names, r.approved_by),
        approvedAt: r.approved_at,
        scheduledAt: r.scheduled_at,
        justification: r.justification,
        version: r.version,
      };
    });
  });
}

const missingArticle = (id: string): ArticleRef => ({
  id,
  slug: "",
  title: "Matéria indisponível",
  sectionSlug: "",
  sectionName: "",
  publishedAt: null,
});

// ---------------------------------------------------------------------------
// Histórico (§10.4)
// ---------------------------------------------------------------------------

function historyQuery(db: DbClient, f: HistoryFilter) {
  let q = db.from("push_sends").select("*", { count: "exact" });
  if (f.days !== null)
    q = q.gte("created_at", new Date(Date.now() - f.days * 86_400_000).toISOString());
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status) q = q.eq("status", f.status);
  return q.order("created_at", { ascending: false });
}

async function countersOf(
  sendIds: string[],
): Promise<Map<string, { delivered: number; clicked: number }>> {
  if (sendIds.length === 0) return new Map();
  const svc = createServiceClient();
  const rows = many(
    await svc
      .from("push_send_counters")
      .select("send_id, delivered, clicked")
      .in("send_id", sendIds),
  );
  const out = new Map<string, { delivered: number; clicked: number }>();
  for (const r of rows) {
    const cur = out.get(r.send_id) ?? { delivered: 0, clicked: 0 };
    out.set(r.send_id, {
      delivered: cur.delivered + r.delivered,
      clicked: cur.clicked + r.clicked,
    });
  }
  return out;
}

function toHistoryRow(
  r: SendRow,
  names: Map<string, string>,
  articles: Map<string, ArticleRef>,
  sections: Map<string, string>,
  counters: Map<string, { delivered: number; clicked: number }>,
): HistoryRow {
  const kind = asKind(r.kind);
  const c = counters.get(r.id) ?? { delivered: 0, clicked: 0 };
  const skipped = r.skipped_pref_n + r.skipped_limit_n + r.skipped_quiet_n + r.skipped_duplicate_n;
  return {
    id: r.id,
    kind,
    status: asStatus(r.status),
    article: articles.get(r.article_id) ?? missingArticle(r.article_id),
    title: r.title,
    audienceLabel: audienceLabel(kind, parseAudience(r.audience), sections),
    requestedBy: person(names, r.requested_by),
    approvedBy: person(names, r.approved_by),
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    targets: r.targets_n,
    sent: r.accepted_n + r.failed_n,
    accepted: r.accepted_n,
    failed: r.failed_n,
    removed: r.removed_n,
    skipped,
    delivered: c.delivered,
    clicked: c.clicked,
    ctr: c.delivered > 0 ? c.clicked / c.delivered : null,
  };
}

export async function historyRows(
  f: HistoryFilter,
): Promise<Result<{ rows: HistoryRow[]; total: number }, QueryError>> {
  return read(async (db) => {
    const from = (f.page - 1) * HISTORY_PAGE_SIZE;
    const { data, error, count } = await historyQuery(db, f).range(
      from,
      from + HISTORY_PAGE_SIZE - 1,
    );
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SendRow[];
    const [names, articles, sections, counters] = await Promise.all([
      namesOf(
        db,
        rows.flatMap((r) => [r.requested_by, r.approved_by]),
      ),
      articlesOf(
        db,
        rows.map((r) => r.article_id),
      ),
      sectionNames(db),
      countersOf(rows.map((r) => r.id)),
    ]);
    return {
      rows: rows.map((r) => toHistoryRow(r, names, articles, sections, counters)),
      total: count ?? rows.length,
    };
  });
}

export async function historyDetail(id: string): Promise<Result<HistoryDetail | null, QueryError>> {
  return read(async (db) => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
    const r = one<SendRow>(await db.from("push_sends").select("*").eq("id", id).maybeSingle());
    if (!r) return null;
    const svc = createServiceClient();
    const [names, articles, sections, counters, deliveries, byDevice] = await Promise.all([
      namesOf(db, [r.requested_by, r.approved_by]),
      articlesOf(db, [r.article_id]),
      sectionNames(db),
      countersOf([r.id]),
      many(
        await svc
          .from("push_deliveries")
          .select("status, skip_reason, error_code, device_class, browser")
          .eq("send_id", r.id),
      ),
      many(
        await svc
          .from("push_send_counters")
          .select("device_class, browser, delivered, clicked")
          .eq("send_id", r.id),
      ),
    ]);
    const base = toHistoryRow(r, names, articles, sections, counters);
    const skips = new Map<string, number>();
    const failures = new Map<string, number>();
    const sentBy = new Map<string, number>();
    for (const d of deliveries) {
      if (d.status === "skipped" && d.skip_reason)
        skips.set(d.skip_reason, (skips.get(d.skip_reason) ?? 0) + 1);
      if (d.status === "failed" || d.status === "expired") {
        const code = d.error_code ?? "unknown";
        failures.set(code, (failures.get(code) ?? 0) + 1);
      }
      if (d.status === "sent") {
        const k = `${d.device_class ?? "other"}|${d.browser ?? "other"}`;
        sentBy.set(k, (sentBy.get(k) ?? 0) + 1);
      }
    }
    const keys = new Set<string>([
      ...sentBy.keys(),
      ...byDevice.map((b) => `${b.device_class}|${b.browser}`),
    ]);
    const devices = [...keys].sort().map((k) => {
      const [device, browser] = k.split("|") as [string, string];
      const c = byDevice.find((b) => b.device_class === device && b.browser === browser);
      return {
        device,
        browser,
        sent: sentBy.get(k) ?? 0,
        delivered: c?.delivered ?? 0,
        clicked: c?.clicked ?? 0,
      };
    });
    const timeline: HistoryDetail["timeline"] = [
      { at: r.created_at, label: "requested", by: base.requestedBy?.name ?? null },
    ];
    if (r.approved_at)
      timeline.push({ at: r.approved_at, label: "approved", by: base.approvedBy?.name ?? null });
    if (r.started_at) timeline.push({ at: r.started_at, label: "started", by: null });
    if (r.finished_at) timeline.push({ at: r.finished_at, label: "finished", by: null });
    const terminal: Partial<Record<SendStatus, TimelineLabel>> = {
      rejected: "rejected",
      cancelled: "cancelled",
      expired: "expired",
      paused: "paused",
    };
    const t = terminal[base.status];
    if (t) timeline.push({ at: r.finished_at ?? r.created_at, label: t, by: null });
    return {
      ...base,
      body: r.body,
      originLabel: r.origin_label,
      statusReason: r.status_reason,
      justification: r.justification,
      scheduledAt: r.scheduled_at,
      approvedAt: r.approved_at,
      timeline,
      skips: [...skips].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
      failures: [...failures].map(([code, n]) => ({ code, n })).sort((a, b) => b.n - a.n),
      byDevice: devices,
    };
  });
}

const CSV_HEADER = [
  "data",
  "tipo",
  "materia",
  "titulo",
  "publico",
  "pedido_por",
  "aprovado_por",
  "estado",
  "alvos",
  "enviados",
  "aceitos",
  "falhas",
  "removidas",
  "puladas",
  "recebidos",
  "tocados",
  "ctr",
];

const csvCell = (v: string | number | null): string => {
  const s = v === null ? "" : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV do histórico (mesmos filtros, sem paginação, até 5 000 linhas): nenhum dado de inscrição. */
export async function historyCsv(f: HistoryFilter): Promise<string> {
  const r = await read(async (db) => {
    const { data, error } = await historyQuery(db, f).limit(5000);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as SendRow[];
    const [names, articles, sections, counters] = await Promise.all([
      namesOf(
        db,
        rows.flatMap((x) => [x.requested_by, x.approved_by]),
      ),
      articlesOf(
        db,
        rows.map((x) => x.article_id),
      ),
      sectionNames(db),
      countersOf(rows.map((x) => x.id)),
    ]);
    return rows.map((x) => toHistoryRow(x, names, articles, sections, counters));
  });
  const rows = r.ok ? r.value : [];
  const lines = rows.map((h) =>
    [
      h.createdAt,
      h.kind,
      h.article.title,
      h.title,
      h.audienceLabel,
      h.requestedBy?.name ?? "sistema",
      h.approvedBy?.name ?? "",
      h.status,
      h.targets,
      h.sent,
      h.accepted,
      h.failed,
      h.removed,
      h.skipped,
      h.delivered,
      h.clicked,
      h.ctr === null ? "" : h.ctr.toFixed(3),
    ]
      .map(csvCell)
      .join(";"),
  );
  return [CSV_HEADER.join(";"), ...lines].join("\r\n") + "\r\n";
}

// ---------------------------------------------------------------------------
// Novo envio (§10.2)
// ---------------------------------------------------------------------------

function editorSections(roles: RoleGrant[]): string[] | null {
  if (canAccess(roles, "push.approve") || canAccess(roles, "push.settings")) return null;
  const sections = roles.filter((r) => r.role === "editor").flatMap((r) => r.sections);
  return [...new Set(sections)];
}

function originLabelOf(a: { publish_mode: string | null; kind: string }): string {
  if (a.publish_mode === "auto") return "PUBLICADO AUTOMATICAMENTE";
  if (a.kind === "normalized") return "NORMALIZADO PELO CITYNEWS";
  return "ORIGINAL CITYNEWS";
}

/** Matérias publicadas, não patrocinadas, por trecho do título; editor só da própria editoria. */
export async function searchArticles(q: string, roles: RoleGrant[]): Promise<ArticleOption[]> {
  const term = q.trim().slice(0, 100);
  const r = await read(async (db) => {
    let query = db
      .from("articles")
      .select("id, slug, title, dek, section_slug, published_at, publish_mode, kind, urgent")
      .eq("status", "published")
      .eq("sponsored", false)
      .order("published_at", { ascending: false })
      .limit(10);
    const only = editorSections(roles);
    if (only !== null) {
      if (only.length === 0) return [];
      query = query.in("section_slug", only);
    }
    if (term) query = query.ilike("title", `%${term.replace(/[%_]/g, "")}%`);
    const [rows, sections] = await Promise.all([many(await query), sectionNames(db)]);
    return rows.map((a) => ({
      id: a.id,
      slug: a.slug,
      title: a.title,
      dek: a.dek,
      sectionSlug: a.section_slug,
      sectionName: sections.get(a.section_slug) ?? a.section_slug,
      publishedAt: a.published_at,
      originLabel: originLabelOf(a),
      urgent: a.urgent,
    }));
  });
  return r.ok ? r.value : [];
}

/** Alcance estimado (D-P24): arredondado para dezenas, 0 = "menos de 20"; `null` sem banco. */
export async function audienceEstimate(
  kind: PushKind,
  audience: AdminAudience,
): Promise<number | null> {
  const r = await read(async (db) => {
    const { data, error } = await db.rpc("push_audience_estimate", {
      p_kind: kind,
      p_audience: audience as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return typeof data === "number" ? data : null;
  });
  return r.ok ? r.value : null;
}

// ---------------------------------------------------------------------------
// Configurações (§10.5)
// ---------------------------------------------------------------------------

function templatesOf(v: Json | undefined): PushTemplate[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((t) => (typeof t === "object" && t !== null ? (t as Record<string, unknown>) : null))
    .filter((t): t is Record<string, unknown> => t !== null)
    .map((t) => ({
      name: String(t.name ?? ""),
      title: String(t.title ?? ""),
      body: String(t.body ?? ""),
    }))
    .slice(0, 20);
}

export async function pushSettings(): Promise<PushSettingsView> {
  const fallback: PushSettingsView = {
    dailyLimit: 3,
    quietStart: 22,
    quietEnd: 7,
    templates: [],
    paused: { on: false, by: null, at: null, reason: null },
    vapid: vapidStatus(),
  };
  const r = await read(async (db) => {
    const rows = many(await db.from("app_settings").select("key, value").like("key", "push.%"));
    const val = (key: string): Json | undefined => rows.find((x) => x.key === key)?.value;
    const num = (key: string, d: number) => {
      const v = val(key);
      return typeof v === "number" ? v : d;
    };
    const p = (val("push.paused") ?? {}) as {
      on?: boolean;
      by?: string | null;
      at?: string | null;
      reason?: string | null;
    };
    const names = await namesOf(db, [p.by ?? null]);
    return {
      dailyLimit: num("push.default_daily_limit", 3),
      quietStart: num("push.quiet_start", 22),
      quietEnd: num("push.quiet_end", 7),
      templates: templatesOf(val("push.templates")),
      paused: {
        on: p.on === true,
        by: person(names, p.by ?? null),
        at: typeof p.at === "string" ? p.at : null,
        reason: typeof p.reason === "string" ? p.reason : null,
      },
      vapid: vapidStatus(),
    };
  });
  return r.ok ? r.value : fallback;
}

/** Só os nomes das variáveis que faltam (nunca valores; D-P25). */
export function vapidStatus(env: NodeJS.ProcessEnv = process.env): {
  ok: boolean;
  missing: string[];
} {
  const missing = missingVapidVars(env);
  return { ok: missing.length === 0, missing };
}
