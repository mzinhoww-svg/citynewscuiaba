"use server";

/**
 * Server Actions do painel de fontes (spec §7, §9, §10). Toda ação: `requireRole("source.manage")`
 * (redireciona para /entrar com motivo), limite por pessoa em `hit_rate_limit`, escrita pelas RPCs
 * com a sessão da pessoa (RLS e triggers de 0011) e contexto de auditoria `{ reason, batchId,
 * ipHash }` (hash do IP com o sal diário, A-048; nunca o IP cru). Só POST (Server Actions): nenhuma
 * rota GET muda estado.
 */
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { can } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { createApprovals, supabaseApprovalsPort } from "@/lib/approvals";
import { createProductionAi } from "@/lib/ai/server";
import { createServerClient, createServiceClient, type DbClient } from "@/lib/db/client";
import { createSupabaseMediaStore } from "@/lib/db/media-store";
import { createIngestRepo, createMediaRepo } from "@/lib/db/pipeline-store";
import { configFromRow, parseSourceTarget } from "@/lib/db/queries/sources-admin";
import {
  createSourceAdminStore,
  CRITICAL_COLUMN_TO_KEY,
  kindForStrategy,
  type AuditCtx,
  type BulkAction,
  type BulkItemResult,
  type BulkReason,
  type SourceAdminStore,
  type SourcePatch,
  type StatusAction,
  type StoreError,
} from "@/lib/db/source-admin-store";
import type { Json } from "@/lib/db/types";
import { hitRateLimit } from "@/lib/db/writes";
import { takedownReproduction } from "@/lib/media/takedown";
import { createMemoryMediaStore } from "@/lib/media/store";
import { collectNow } from "@/lib/pipeline/collect-now";
import { defaultCollectNowDeps } from "@/lib/pipeline/deps";
import { revalidateTags } from "@/lib/pipeline/revalidate";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import {
  criticalChanges,
  defaultFrequencySchema,
  diffConfig,
  fastLaneMaxSchema,
  FAST_FREQUENCIES,
  frequencySchema,
  isSafeSelector,
  normalizePastedUrl,
  slugFromName,
  sourceConfigSchema,
  targetRefFor,
  type FieldChange,
  type PageSelectors,
  type SourceConfig,
} from "@/lib/sources";
import { analyzeLink, type AnalyzeError, type LinkAnalysis } from "@/lib/sources/analyze";
import { crawlDeps } from "@/lib/sources/http-deps";
import { validateLogo } from "@/lib/sources/logo";
import { testConnection } from "@/lib/sources/test-connection";
import {
  ANALYZE_TEXT,
  APPROVAL_ERROR_TEXT,
  clockTime,
  SOURCE_ACTION_TEXT as T,
} from "@/content/pt-BR/sources-admin";

export type ActionState =
  | { ok: true; message: string; data?: unknown }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const NEXT = "/estudio/control/fontes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600;

/** Limites por pessoa (spec §10). Escrita geral é folgada: protege contra laço, não contra uso. */
const LIMITS = {
  write: { bucket: "source_admin_write", limit: 120, windowSec: HOUR },
  analyze: { bucket: "source_admin_analyze", limit: 10, windowSec: HOUR },
  test: { bucket: "source_admin_test", limit: 30, windowSec: HOUR },
  approve: { bucket: "source_admin_approve", limit: 60, windowSec: HOUR },
} as const;

const fail = (message: string, fieldErrors?: Record<string, string>): ActionState =>
  fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };
const done = (message: string, data?: unknown): ActionState =>
  data === undefined ? { ok: true, message } : { ok: true, message, data };

// ---------------------------------------------------------------------------
// Contexto comum
// ---------------------------------------------------------------------------

interface Ctx {
  userId: string;
  roles: Awaited<ReturnType<typeof requireRole>>["roles"];
  now: Date;
  ipHash: string | null;
  db: DbClient;
  store: SourceAdminStore;
}

async function context(): Promise<Ctx> {
  const session = await requireRole("source.manage", undefined, { next: NEXT });
  const now = new Date();
  const salt = rateLimitSalt();
  const ipHash = salt ? ipKey(clientIp(await headers()), now, salt) : null;
  const db = await createServerClient();
  return {
    userId: session.userId,
    roles: session.roles,
    now,
    ipHash,
    db,
    store: createSourceAdminStore(db, { storage: createServiceClient }),
  };
}

/** Cota por pessoa (chave com hash do id, nunca dado cru). Banco fora do ar: recusa. */
async function allow(ctx: Ctx, limit: { bucket: string; limit: number; windowSec: number }) {
  const key = createHash("sha256").update(`user:${ctx.userId}`).digest("hex");
  const r = await hitRateLimit(limit.bucket, key, limit.limit, limit.windowSec);
  return r.ok && r.value;
}

const auditCtx = (ctx: Ctx, extra: Omit<AuditCtx, "ipHash"> = {}): AuditCtx => ({
  ...extra,
  ipHash: ctx.ipHash,
});

function refresh(id?: string) {
  revalidatePath(NEXT, "layout");
  if (id) revalidatePath(`${NEXT}/${id}`, "layout");
}

async function sourceRow(ctx: Ctx, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.db.from("sources").select("*").eq("id", id).maybeSingle();
  return data;
}

async function conflictMessage(ctx: Ctx, id: string): Promise<string> {
  const last = await ctx.store.lastChange(id).catch(() => null);
  if (!last) return T.conflictUnknown;
  return T.conflict(last.actorName ?? T.systemActor, clockTime(last.at));
}

/** Mensagem de erro comum da escrita (conflito com quem e quando). */
async function storeFailure(ctx: Ctx, id: string, e: StoreError): Promise<ActionState> {
  switch (e) {
    case "conflict":
      return fail(await conflictMessage(ctx, id));
    case "forbidden":
    case "needs_approval":
      return fail(T.forbidden);
    case "not_found":
      return fail(T.notFound);
    case "fast_lane_inactive":
      return fail(T.fastLaneInactive, { frequencyMinutes: T.fastLaneInactive });
    case "fast_lane_full": {
      const lane = await ctx.store.fastLane();
      const msg = T.fastLaneFull(lane.used, lane.max);
      return fail(msg, { frequencyMinutes: msg });
    }
    case "invalid":
    case "duplicate":
    case "invalid_transition":
      return fail(T.invalid);
    default:
      return fail(T.unavailable);
  }
}

// ---------------------------------------------------------------------------
// Formulário → patch
// ---------------------------------------------------------------------------

const BOOL_FIELDS = ["maySoleSource", "recPinned", "recLocalHighlight", "recExcluded"] as const;
const INT_FIELDS = ["rateLimitPerHour", "editorialScore", "priority"] as const;
const NULLABLE_INT_FIELDS = ["layer", "frequencyMinutes", "termsMinIntervalMinutes"] as const;
const NULLABLE_TEXT_FIELDS = [
  "displayName",
  "agreementUntil",
  "agreementNote",
  "termsUrl",
  "feedUrl",
] as const;
const TEXT_FIELDS = [
  "name",
  "locality",
  "reliability",
  "imagePolicy",
  "republishPolicy",
  "strategy",
] as const;

const text = (form: FormData, key: string): string | undefined => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};
const toBool = (v: string) => v === "true" || v === "on" || v === "1";
const toInt = (v: string): number => (/^-?\d+$/.test(v.trim()) ? Number(v) : Number.NaN);

/**
 * Lê só os campos presentes (edição parcial por seção). Valores vazios de campos opcionais viram
 * `null`; `frequencyMinutes` vazio ou "padrao" = segue o padrão global.
 */
function readConfigPatch(form: FormData): {
  patch: Partial<SourceConfig>;
  errors: Record<string, string>;
} {
  const raw: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const k of BOOL_FIELDS) {
    const v = text(form, k);
    if (v !== undefined) raw[k] = toBool(v);
  }
  for (const k of INT_FIELDS) {
    const v = text(form, k);
    if (v !== undefined) raw[k] = toInt(v);
  }
  for (const k of NULLABLE_INT_FIELDS) {
    const v = text(form, k);
    if (v === undefined) continue;
    raw[k] = v.trim() === "" || v === "null" || v === "padrao" ? null : toInt(v);
  }
  for (const k of NULLABLE_TEXT_FIELDS) {
    const v = text(form, k);
    if (v !== undefined) raw[k] = v.trim() === "" ? null : v.trim();
  }
  for (const k of TEXT_FIELDS) {
    const v = text(form, k);
    if (v !== undefined) raw[k] = v.trim();
  }
  if (form.has("categories")) {
    raw.categories = form
      .getAll("categories")
      .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
      .map((v) => v.trim())
      .filter(Boolean);
  }
  const selectors = text(form, "pageSelectors");
  if (selectors !== undefined) {
    if (selectors.trim() === "") raw.pageSelectors = null;
    else {
      try {
        raw.pageSelectors = JSON.parse(selectors) as unknown;
      } catch {
        errors.pageSelectors = T.invalid;
      }
    }
  }
  const parsed = sourceConfigSchema.partial().safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      errors[field] ??= issue.message;
    }
    return { patch: {}, errors };
  }
  const sel = parsed.data.pageSelectors;
  if (
    sel &&
    ![sel.item, sel.link, sel.title, ...(sel.date ? [sel.date] : [])].every(isSafeSelector)
  )
    errors.pageSelectors = T.invalid;
  return { patch: parsed.data as Partial<SourceConfig>, errors };
}

/** Patch de escrita (não crítico) a partir do diff; estratégia/seletores vão para `consumption`. */
function writePatch(
  changes: FieldChange[],
  after: SourceConfig,
  consumption: Record<string, unknown>,
): SourcePatch {
  const patch: Record<string, unknown> = {};
  let collection = false;
  for (const c of changes) {
    if (c.field === "strategy" || c.field === "pageSelectors" || c.field === "feedUrl") {
      collection = true;
      continue;
    }
    if (c.field === "slug" || c.field === "baseUrl") continue;
    patch[c.field] = after[c.field as keyof SourceConfig];
  }
  if (collection) {
    patch.consumption = {
      ...consumption,
      strategy: after.strategy,
      feedUrl: after.feedUrl,
      pageSelectors: after.pageSelectors,
    };
    patch.kind = kindForStrategy(after.strategy);
    patch.feedUrl = after.feedUrl;
  }
  return patch as SourcePatch;
}

const CRITICAL_KEYS = new Set(["imagePolicy", "republishPolicy", "reliability", "maySoleSource"]);

/** `source:<id>:<campo>=<valor>` → `{ field, value }` (snake, texto) para a auditoria. */
function targetParts(ref: string) {
  const t = parseSourceTarget(ref);
  return t ? { field: t.field, value: t.value } : { field: "", value: "" };
}

/**
 * Pede segunda aprovação para cada mudança crítica (D-F3), sem duplicar um pedido pendente
 * idêntico, e audita `source.approval_requested` (com o valor de antes, para detectar pedido
 * obsoleto na aprovação).
 */
async function requestCritical(
  ctx: Ctx,
  sourceId: string,
  changes: { targetRef: string; from: unknown }[],
  justification: string,
): Promise<number> {
  const approvals = createApprovals(ctx.db);
  const open = await approvals.pending(`source:${sourceId}:`);
  let n = 0;
  for (const c of changes) {
    const existing = open.find((a) => a.targetRef === c.targetRef);
    let approvalId = existing?.id;
    if (!approvalId) {
      const r = await approvals.requestApproval({
        kind: "source.critical",
        targetRef: c.targetRef,
        justification,
      });
      if (!r.ok) continue;
      approvalId = r.value.id;
      const { field, value } = targetParts(c.targetRef);
      await ctx.store.audit({
        actor: ctx.userId,
        action: "source.approval_requested",
        objectRef: `source:${sourceId}`,
        details: { approvalId, field, from: c.from, to: value, justification },
        ipHash: ctx.ipHash,
      });
    }
    n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Editar (§7.2)
// ---------------------------------------------------------------------------

export async function updateSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const version = toInt(text(form, "version") ?? "");
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (!Number.isInteger(version)) return fail(T.invalid);

  const { patch, errors } = readConfigPatch(form);
  for (const k of ["slug", "baseUrl"] as const) {
    const v = text(form, k);
    if (v !== undefined && v.trim() !== row[k === "slug" ? "slug" : "base_url"])
      errors[k] = "Este campo não muda depois que a fonte é criada.";
  }
  if (Object.keys(errors).length > 0) return fail(T.invalid, errors);

  const before = configFromRow(row);
  const after: SourceConfig = { ...before, ...patch };
  const changes = diffConfig(before, after);
  const critical = criticalChanges(before, after);
  const nonCritical = changes.filter((c) => !CRITICAL_KEYS.has(c.field));
  if (changes.length === 0) return done(T.nothingToSave, { version: row.version });

  const justification = text(form, "justification")?.trim() ?? "";
  if (critical.length > 0 && !justification)
    return fail(T.justificationRequired, { justification: T.justificationRequired });
  if (row.version !== version) return fail(await conflictMessage(ctx, id));

  let newVersion = row.version;
  if (nonCritical.length > 0) {
    const r = await ctx.store.update(
      id,
      version,
      writePatch(nonCritical, after, (row.consumption as Record<string, unknown>) ?? {}),
      auditCtx(ctx, { reason: text(form, "reason")?.trim() || null }),
    );
    if (!r.ok) return storeFailure(ctx, id, r.error);
    newVersion = r.value.version;
  }

  const pending =
    critical.length > 0
      ? await requestCritical(
          ctx,
          id,
          critical.map((c) => ({ targetRef: targetRefFor(id, c), from: c.from })),
          justification,
        )
      : 0;
  refresh(id);
  const message =
    pending === 0
      ? T.saved
      : nonCritical.length > 0
        ? T.savedWithPending(pending)
        : T.pendingApproval(pending);
  return done(message, { version: newVersion, pending });
}

// ---------------------------------------------------------------------------
// Aprovar ou recusar mudança crítica (§7.5)
// ---------------------------------------------------------------------------

function criticalValue(field: string, value: string): unknown {
  if (field === "may_be_sole_source") return value === "true";
  return value;
}

/** Valor atual da coluna crítica em texto, para detectar pedido obsoleto. */
function currentText(row: Record<string, unknown>, field: string): string {
  const v = row[field];
  return v === null || v === undefined ? "" : String(v);
}

export async function decideApprovalAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.approve))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const decision = text(form, "decision");
  if (!UUID.test(id) || (decision !== "approve" && decision !== "reject")) return fail(T.invalid);

  const port = supabaseApprovalsPort(ctx.db);
  const approval = await port.get(id);
  if (!approval || approval.kind !== "source.critical")
    return fail(APPROVAL_ERROR_TEXT.not_pending);
  // Autoaprovação primeiro: a mesma pessoa recebe a mensagem certa, com ou sem o papel.
  if (approval.requestedBy === ctx.userId) return fail(APPROVAL_ERROR_TEXT.self_approval);
  if (!can(ctx.roles, "source.approve_critical")) return fail(APPROVAL_ERROR_TEXT.forbidden);

  const target = parseSourceTarget(approval.targetRef);
  if (!target) return fail(T.invalid);
  const approvals = createApprovals(ctx.db);
  const objectRef = `source:${target.sourceId}`;

  if (decision === "reject") {
    const reason = text(form, "reason")?.trim() ?? "";
    if (!reason) return fail(T.reasonRequired, { reason: T.reasonRequired });
    const r = await approvals.reject({ id, reason });
    if (!r.ok) return fail(APPROVAL_ERROR_TEXT[r.error]);
    await ctx.store.audit({
      actor: ctx.userId,
      action: "source.approval_rejected",
      objectRef,
      details: { approvalId: id, field: target.field, to: target.value, reason },
      ipHash: ctx.ipHash,
    });
    refresh(target.sourceId);
    return done(T.approval.rejected);
  }

  const row = await sourceRow(ctx, target.sourceId);
  if (!row) return fail(T.notFound);

  if (approval.status === "pending") {
    // Obsoleto (§7.5.5): o campo mudou entre o pedido e a aprovação.
    const { data: asked } = await ctx.db
      .from("audit_log")
      .select("details")
      .eq("object_ref", objectRef)
      .eq("action", "source.approval_requested")
      .eq("details->>approvalId", id)
      .limit(1)
      .maybeSingle();
    const from = (asked?.details as { from?: unknown } | undefined)?.from;
    const expected =
      target.field === "status" ? "blocked" : from === undefined ? null : String(from);
    if (expected !== null && currentText(row, target.field) !== expected) {
      const reason = T.approval.obsoleteReason;
      await approvals.reject({ id, reason });
      await ctx.store.audit({
        actor: ctx.userId,
        action: "source.approval_rejected",
        objectRef,
        details: { approvalId: id, field: target.field, to: target.value, reason, obsolete: true },
        ipHash: ctx.ipHash,
      });
      refresh(target.sourceId);
      return fail(T.approval.obsolete);
    }
    const r = await approvals.approve({ id });
    if (!r.ok) return fail(APPROVAL_ERROR_TEXT[r.error]);
  } else if (approval.status !== "approved") {
    return fail(APPROVAL_ERROR_TEXT.not_pending);
  }

  // Aplica com a aprovação: o trigger `guard_source_changes` consome (`applied`).
  const ctxAudit = auditCtx(ctx, { reason: approval.justification, approvalId: id });
  const apply = async (version: number) =>
    target.field === "status"
      ? ctx.store.setStatus(target.sourceId, version, "unblock", null, ctxAudit)
      : ctx.store.update(
          target.sourceId,
          version,
          {
            [CRITICAL_COLUMN_TO_KEY[target.field] ?? target.field]: criticalValue(
              target.field,
              target.value,
            ),
          } as SourcePatch,
          ctxAudit,
        );
  let applied = await apply(row.version);
  if (!applied.ok && applied.error === "conflict") {
    const fresh = await sourceRow(ctx, target.sourceId);
    if (fresh) applied = await apply(fresh.version);
  }
  if (!applied.ok) return fail(T.approval.notApplied);

  await ctx.store.audit({
    actor: ctx.userId,
    action: "source.approval_applied",
    objectRef,
    details: {
      approvalId: id,
      requestedBy: approval.requestedBy,
      approvedBy: ctx.userId,
      field: target.field,
      to: target.value,
      justification: approval.justification,
    },
    ipHash: ctx.ipHash,
  });
  refresh(target.sourceId);
  return done(T.approval.approved, { version: applied.value.version });
}

// ---------------------------------------------------------------------------
// Ciclo de vida (§7.3)
// ---------------------------------------------------------------------------

const STATUS_ACTIONS: readonly StatusAction[] = [
  "activate",
  "pause",
  "resume",
  "block",
  "unblock",
  "archive",
  "restore",
];
const BLOCK_REASONS = ["opt_out", "legal", "quality", "other"] as const;

function takedownDeps() {
  const svc = createServiceClient();
  return {
    repo: createMediaRepo(svc),
    store:
      process.env.MEDIA_STORE === "memory" && process.env.NODE_ENV !== "production"
        ? createMemoryMediaStore()
        : createSupabaseMediaStore(svc),
    revalidate: revalidateTags,
    now: () => new Date(),
  };
}

type Row = NonNullable<Awaited<ReturnType<typeof sourceRow>>>;

/** Ativar/retomar (§7.3): termos revisados, robots.txt e teste de conexão antes de `active`. */
async function activationCheck(ctx: Ctx, row: Row): Promise<string | null> {
  if (!row.terms_reviewed_at) return T.termsRequired;
  const result = await testConnection(
    {
      kind: row.kind,
      feedUrl: row.feed_url,
      baseUrl: row.base_url,
      consumption: (row.consumption ?? {}) as never,
    },
    {
      ...crawlDeps({ repo: createIngestRepo(createServiceClient()) }),
      now: () => Date.now(),
      callerId: ctx.userId,
    },
  );
  return result.ok ? null : result.message;
}

export async function sourceStatusAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const version = toInt(text(form, "version") ?? "");
  const action = text(form, "action") as StatusAction | undefined;
  if (!action || !STATUS_ACTIONS.includes(action) || !Number.isInteger(version))
    return fail(T.invalid);
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.version !== version) return fail(await conflictMessage(ctx, id));
  const reason = text(form, "reason")?.trim() ?? "";

  if (action === "unblock") {
    if (row.status !== "blocked") return fail(T.invalidTransition.unblock);
    const justification = text(form, "justification")?.trim() ?? "";
    if (!justification)
      return fail(T.justificationRequired, { justification: T.justificationRequired });
    await requestCritical(
      ctx,
      id,
      [{ targetRef: `source:${id}:status=paused`, from: "blocked" }],
      justification,
    );
    refresh(id);
    return done(T.status.unblockRequested, { pending: 1 });
  }

  let statusReason: string | null = null;
  if (action === "block") {
    if (!(BLOCK_REASONS as readonly string[]).includes(reason))
      return fail(T.reasonRequired, { reason: T.reasonRequired });
    statusReason = reason;
  }
  if (action === "archive") {
    if (!reason) return fail(T.reasonRequired, { reason: T.reasonRequired });
    const typed = text(form, "confirmName")?.trim() ?? "";
    if (typed !== row.name && typed !== row.display_name)
      return fail(T.confirmName, { confirmName: T.confirmName });
    statusReason = reason;
  }
  if (action === "pause") statusReason = "manual";
  if (
    (action === "activate" || action === "resume") &&
    row.status === "paused" &&
    !row.archived_at
  ) {
    const problem = await activationCheck(ctx, row);
    if (problem) return fail(problem);
  }

  const r = await ctx.store.setStatus(
    id,
    version,
    action,
    statusReason,
    auditCtx(ctx, { reason: reason || null }),
  );
  if (!r.ok) {
    if (r.error === "invalid_transition") return fail(T.invalidTransition[action]);
    return storeFailure(ctx, id, r.error);
  }

  let message: string = T.status[action];
  if (action === "block" && reason === "opt_out") {
    // Opt-out (D-F20): o banco já zerou `image_policy`; aqui saem as reproduções (A-010, A-038).
    const removed = await takedownReproduction(
      takedownDeps(),
      { sourceId: id },
      ctx.userId,
      "Pedido do veículo (opt-out)",
    );
    message = T.status.blockOptOut(removed.ok ? removed.value.blocked : 0);
  }
  refresh(id);
  return done(message, { version: r.value.version });
}

export async function activateSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  let version = toInt(text(form, "version") ?? "");
  let row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.version !== version) return fail(await conflictMessage(ctx, id));
  if (row.status !== "paused" || row.archived_at) return fail(T.invalidTransition.activate);

  if (!row.terms_reviewed_at && toBool(text(form, "termsReviewed") ?? "")) {
    const r = await ctx.store.update(
      id,
      version,
      { termsReviewedAt: ctx.now.toISOString(), termsReviewedBy: ctx.userId },
      auditCtx(ctx),
    );
    if (!r.ok) return storeFailure(ctx, id, r.error);
    version = r.value.version;
    row = (await sourceRow(ctx, id)) ?? row;
  }
  if (!row.terms_reviewed_at) return fail(T.termsRequired, { termsReviewed: T.termsRequired });

  const problem = await activationCheck(ctx, row);
  if (problem) return fail(problem);
  const r = await ctx.store.setStatus(id, version, "activate", null, auditCtx(ctx));
  if (!r.ok) return storeFailure(ctx, id, r.error);
  refresh(id);
  return done(T.status.activate, { version: r.value.version });
}

// ---------------------------------------------------------------------------
// Testar conexão, coletar agora (§7.4)
// ---------------------------------------------------------------------------

export async function testConnectionAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.test))) return fail(T.test.rateLimited);
  const row = await sourceRow(ctx, text(form, "id") ?? "");
  if (!row) return fail(T.notFound);
  const result = await testConnection(
    {
      kind: row.kind,
      feedUrl: row.feed_url,
      baseUrl: row.base_url,
      consumption: (row.consumption ?? {}) as never,
    },
    {
      ...crawlDeps({ repo: createIngestRepo(createServiceClient()) }),
      now: () => Date.now(),
      callerId: ctx.userId,
    },
  );
  await ctx.store.audit({
    actor: ctx.userId,
    action: "source.test",
    objectRef: `source:${row.id}`,
    details: { ok: result.ok, status: result.status, items: result.items, ms: result.ms },
    ipHash: ctx.ipHash,
  });
  return result.ok ? done(result.message, result) : fail(result.message);
}

export async function collectNowAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  const row = await sourceRow(ctx, text(form, "id") ?? "");
  if (!row) return fail(T.notFound);
  const r = await collectNow(row.id, defaultCollectNowDeps(ctx.userId));
  if (!r.ok) {
    if (r.error === "not_active") return fail(T.collectNow.notActive);
    if (r.error === "rate_limited") return fail(T.collectNow.rateLimited);
    return fail(T.notFound);
  }
  // `collectNow` não audita (FS-T5): a auditoria da pessoa fica aqui.
  await ctx.store.audit({
    actor: ctx.userId,
    action: "source.collect_now",
    objectRef: `source:${row.id}`,
    details: { runId: r.value.runId },
    ipHash: ctx.ipHash,
  });
  refresh(row.id);
  return done(T.collectNow.queued, { runId: r.value.runId });
}

// ---------------------------------------------------------------------------
// Lote (§7.6)
// ---------------------------------------------------------------------------

const BULK_ACTIONS: readonly BulkAction[] = ["pause", "activate", "frequency"];
const REASON_TEXT: Record<BulkReason, string> = {
  already_paused: T.bulk.reasons.alreadyPaused,
  not_active: T.bulk.reasons.notActive,
  not_paused: T.bulk.reasons.notPaused,
  not_activated: T.bulk.reasons.notActivated,
  blocked: T.bulk.reasons.blocked,
  archived: T.bulk.reasons.archived,
  fast_lane_full: T.bulk.reasons.fastLaneFull,
  not_found: T.bulk.reasons.notFound,
  failed: T.bulk.reasons.failed,
};

function bulkMessage(action: BulkAction, fast: boolean, items: BulkItemResult[]): string {
  const doneN = items.filter((i) => i.outcome === "done").length;
  const skipped = items.filter((i) => i.outcome !== "done");
  const doneText =
    action === "pause"
      ? T.bulk.done.pause(doneN)
      : action === "activate"
        ? T.bulk.done.activate(doneN)
        : fast
          ? T.bulk.done.frequencyFast(doneN)
          : T.bulk.done.frequency(doneN);
  if (skipped.length === 0) return doneText;
  const byReason = new Map<string, number>();
  for (const i of skipped) {
    const why = REASON_TEXT[i.reason ?? "failed"];
    byReason.set(why, (byReason.get(why) ?? 0) + 1);
  }
  const reasons =
    byReason.size === 1
      ? [...byReason.keys()][0]!
      : [...byReason].map(([why, n]) => `${n} ${why}`).join(", ");
  return `${doneText}, ${T.bulk.ignored(skipped.length)}: ${reasons}`;
}

export async function bulkSourcesAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const ids = [
    ...new Set(
      form
        .getAll("ids")
        .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
        .map((v) => v.trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return fail(T.bulk.empty);
  if (ids.length > 50) return fail(T.bulk.tooMany);
  if (!ids.every((i) => UUID.test(i))) return fail(T.invalid);
  const action = text(form, "action") as BulkAction | undefined;
  if (!action || !BULK_ACTIONS.includes(action)) return fail(T.invalid);

  let frequencyMinutes: number | null = null;
  if (action === "frequency") {
    const raw = text(form, "frequencyMinutes") ?? "";
    const value = raw.trim() === "" || raw === "padrao" ? null : toInt(raw);
    const parsed = frequencySchema.safeParse(value);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? T.invalid;
      return fail(msg, { frequencyMinutes: msg });
    }
    frequencyMinutes = parsed.data;
  }

  const r = await ctx.store.bulk(
    ids,
    action,
    { frequencyMinutes },
    auditCtx(ctx, { reason: text(form, "reason")?.trim() || null }),
  );
  if (!r.ok) return fail(r.error === "forbidden" ? T.forbidden : T.unavailable);
  refresh();
  const fast =
    frequencyMinutes !== null && (FAST_FREQUENCIES as readonly number[]).includes(frequencyMinutes);
  return done(bulkMessage(action, fast, r.value.items), r.value);
}

// ---------------------------------------------------------------------------
// Configurações da coleta (§7.7)
// ---------------------------------------------------------------------------

export async function setDefaultFrequencyAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const parsed = defaultFrequencySchema.safeParse(toInt(text(form, "value") ?? ""));
  if (!parsed.success)
    return fail(T.defaultFrequency.invalid, { value: T.defaultFrequency.invalid });
  const r = await ctx.store.setDefaultFrequency(parsed.data, auditCtx(ctx));
  if (!r.ok) return fail(r.error === "forbidden" ? T.forbidden : T.defaultFrequency.invalid);
  refresh();
  return done(T.defaultFrequency.saved, { value: parsed.data });
}

export async function setFastLaneMaxAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const parsed = fastLaneMaxSchema.safeParse(toInt(text(form, "value") ?? ""));
  if (!parsed.success) return fail(T.fastLaneMax.invalid, { value: T.fastLaneMax.invalid });
  const r = await ctx.store.setFastLaneMax(parsed.data, auditCtx(ctx));
  if (!r.ok) return fail(r.error === "forbidden" ? T.forbidden : T.fastLaneMax.invalid);
  refresh();
  return done(T.fastLaneMax.saved, { value: parsed.data });
}

// ---------------------------------------------------------------------------
// Logotipo (D-F25)
// ---------------------------------------------------------------------------

export async function uploadLogoAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const version = toInt(text(form, "version") ?? "");
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.version !== version) return fail(await conflictMessage(ctx, id));
  const file = form.get("logo");
  if (!(file instanceof Blob) || file.size === 0)
    return fail(T.logo.missing, { logo: T.logo.missing });
  if (file.size > 200 * 1024) return fail(T.logo.size, { logo: T.logo.size });
  const bytes = new Uint8Array(await file.arrayBuffer());
  const checked = validateLogo(bytes);
  if (!checked.ok) {
    const msg = T.logo[checked.error === "missing" ? "missing" : checked.error];
    return fail(msg, { logo: msg });
  }
  const up = await ctx.store.uploadLogo(id, { bytes, contentType: checked.value.contentType });
  if (!up.ok) return fail(T.logo.unavailable);
  const r = await ctx.store.update(id, version, { logoPath: up.value.path }, auditCtx(ctx));
  if (!r.ok) return storeFailure(ctx, id, r.error);
  refresh(id);
  return done(T.logo.saved, { version: r.value.version, path: up.value.path });
}

// ---------------------------------------------------------------------------
// Análise por link e cadastro (§7.1)
// ---------------------------------------------------------------------------

function analyzeMessage(error: AnalyzeError, url: string, now: Date): string {
  const E = ANALYZE_TEXT.errors;
  switch (error) {
    case "robots_disallowed": {
      let host = url;
      let path = "/";
      try {
        const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`);
        host = u.hostname;
        path = u.pathname || "/";
      } catch {
        /* mantém o texto colado */
      }
      return E.robots_disallowed(host, path);
    }
    case "rate_limited":
      return E.host_rate_limited;
    case "invalid":
    case "scheme":
    case "credentials":
    case "port":
    case "too_long":
    case "forbidden_host":
    case "robots_unavailable":
    case "nothing_found":
    case "unreachable":
    case "disabled":
      return E[error];
    default:
      return E.rate_limited(60 - now.getUTCMinutes());
  }
}

export async function analyzeLinkAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  const input = (text(form, "url") ?? "").trim();
  if (!input) return fail(ANALYZE_TEXT.errors.invalid, { url: ANALYZE_TEXT.errors.invalid });
  if (!(await allow(ctx, LIMITS.analyze))) {
    const msg = ANALYZE_TEXT.errors.rate_limited(60 - ctx.now.getUTCMinutes());
    return fail(msg, { url: msg });
  }
  const svc = createServiceClient();
  const ai = createProductionAi();
  const flag = async (key: string) => {
    const { data } = await svc.from("feature_flags").select("enabled").eq("key", key).maybeSingle();
    return data?.enabled === true;
  };
  const r = await analyzeLink(input, {
    crawl: crawlDeps({ repo: createIngestRepo(svc) }),
    callAgent: ai.callAgent,
    isEnabled: flag,
    existingSources: async () => {
      const { data } = await ctx.db
        .from("sources")
        .select("id, name, display_name, base_url, feed_url, archived_at");
      return (data ?? []).map((s) => ({
        id: s.id,
        name: s.display_name ?? s.name,
        baseUrl: s.base_url,
        feedUrl: s.feed_url,
        archived: s.archived_at !== null,
      }));
    },
    sections: async () => {
      const { data } = await ctx.db.from("sections").select("slug");
      return (data ?? []).map((s) => s.slug);
    },
    saveDiscovery: async (record) => {
      const { data, error } = await ctx.db.rpc("source_discovery_save", {
        p: record as unknown as Json,
      });
      if (error) throw new Error(`source_discovery_save: ${error.message}`);
      return data;
    },
    promptVersion: () => ai.promptVersion("source_profiler"),
    now: () => ctx.now,
  });
  if (!r.ok) {
    const msg = analyzeMessage(r.error, input, ctx.now);
    return fail(msg, { url: msg });
  }
  await ctx.store.audit({
    actor: ctx.userId,
    action: "source.analyze",
    objectRef: `discovery:${r.value.discoveryId}`,
    details: {
      inputUrl: input,
      strategy: r.value.discovery.strategy,
      aiStatus: r.value.aiStatus,
      duplicateOf: r.value.duplicate?.id ?? null,
    },
    ipHash: ctx.ipHash,
  });
  const data: LinkAnalysis = r.value;
  return done(ANALYZE_TEXT.done, data);
}

const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

export async function createSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const { patch, errors } = readConfigPatch(form);

  const baseRaw = text(form, "baseUrl")?.trim() ?? "";
  const base = normalizePastedUrl(
    /^[a-z][a-z0-9+.-]*:/i.test(baseRaw) ? baseRaw : `https://${baseRaw}`,
  );
  if (!base.ok) errors.baseUrl = ANALYZE_TEXT.errors[base.error];
  const name = patch.name?.trim() ?? "";
  if (!name) errors.name ??= "Nome é obrigatório.";
  const slug = (text(form, "slug")?.trim() || slugFromName(name)).toLowerCase();
  if (!SLUG.test(slug)) errors.slug = "Use só letras minúsculas, números e hífen.";
  const frequency = patch.frequencyMinutes ?? null;
  if (frequency !== null && frequency < 30) errors.frequencyMinutes = T.fastLaneInactive;
  if (Object.keys(errors).length > 0) return fail(T.invalid, errors);

  // Fonte nova nasce no padrão restrito (D-F3, 0011); o que for além vira pedido de aprovação.
  const restricted: SourceConfig = {
    name,
    displayName: patch.displayName ?? null,
    slug,
    layer: patch.layer ?? null,
    categories: patch.categories ?? [],
    locality: patch.locality ?? "mt",
    reliability: patch.reliability === "low" ? "low" : "standard",
    imagePolicy: "none",
    republishPolicy: "link_only",
    maySoleSource: false,
    agreementUntil: patch.agreementUntil ?? null,
    agreementNote: patch.agreementNote ?? null,
    termsUrl: patch.termsUrl ?? null,
    strategy: patch.strategy ?? "rss",
    baseUrl: base.ok ? base.value.toString().replace(/\/$/, "") : baseRaw,
    feedUrl: patch.feedUrl ?? null,
    pageSelectors: (patch.pageSelectors as PageSelectors | null | undefined) ?? null,
    frequencyMinutes: frequency,
    rateLimitPerHour: patch.rateLimitPerHour ?? 20,
    termsMinIntervalMinutes: patch.termsMinIntervalMinutes ?? null,
    editorialScore: patch.editorialScore ?? 3,
    priority: patch.priority ?? 2,
    recPinned: false,
    recLocalHighlight: false,
    recExcluded: false,
  };
  const wanted: SourceConfig = {
    ...restricted,
    reliability: patch.reliability ?? restricted.reliability,
    imagePolicy: patch.imagePolicy ?? "none",
    republishPolicy: patch.republishPolicy ?? "link_only",
    maySoleSource: patch.maySoleSource ?? false,
  };
  const critical = criticalChanges(restricted, wanted);
  const justification = text(form, "justification")?.trim() ?? "";
  if (critical.length > 0 && !justification)
    return fail(T.justificationRequired, { justification: T.justificationRequired });

  let consumption: Record<string, unknown> = {};
  const rawConsumption = text(form, "consumption");
  if (rawConsumption) {
    try {
      const parsed = JSON.parse(rawConsumption) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        consumption = parsed as Record<string, unknown>;
    } catch {
      return fail(T.invalid, { consumption: T.invalid });
    }
  }
  consumption = {
    ...consumption,
    strategy: restricted.strategy,
    feedUrl: restricted.feedUrl,
    pageSelectors: restricted.pageSelectors,
  };

  const created = await ctx.store.create(
    {
      slug,
      name,
      displayName: restricted.displayName,
      baseUrl: restricted.baseUrl,
      kind: kindForStrategy(restricted.strategy),
      feedUrl: restricted.feedUrl,
      categories: restricted.categories,
      locality: restricted.locality,
      layer: restricted.layer,
      frequencyMinutes: frequency,
      rateLimitPerHour: restricted.rateLimitPerHour,
      priority: restricted.priority,
      editorialScore: restricted.editorialScore,
      consumption,
      agreementUntil: restricted.agreementUntil,
      agreementNote: restricted.agreementNote,
      termsUrl: restricted.termsUrl,
    },
    auditCtx(ctx),
  );
  if (!created.ok) {
    if (created.error === "duplicate")
      return fail(T.invalid, { slug: "Já existe uma fonte com este slug." });
    if (created.error === "forbidden") return fail(T.forbidden);
    return fail(created.error === "invalid" ? T.invalid : T.unavailable);
  }
  const id = created.value.id;

  let version = 1;
  const followUp: SourcePatch = {};
  if (toBool(text(form, "termsReviewed") ?? "")) {
    followUp.termsReviewedAt = ctx.now.toISOString();
    followUp.termsReviewedBy = ctx.userId;
  }
  if (restricted.reliability !== "standard") followUp.reliability = restricted.reliability;
  if (Object.keys(followUp).length > 0) {
    const r = await ctx.store.update(id, version, followUp, auditCtx(ctx));
    if (r.ok) version = r.value.version;
  }

  const discoveryId = text(form, "discoveryId");
  if (discoveryId && UUID.test(discoveryId)) {
    const accepted = form
      .getAll("acceptedFields")
      .filter((v): v is string => typeof v === "string" && /^[a-zA-Z]{1,40}$/.test(v));
    await ctx.db.rpc("source_discovery_link", {
      p_id: discoveryId,
      p_source: id,
      p_accepted: accepted,
    });
  }

  const pending =
    critical.length > 0
      ? await requestCritical(
          ctx,
          id,
          critical.map((c) => ({ targetRef: targetRefFor(id, c), from: c.from })),
          justification,
        )
      : 0;

  let message: string = T.created;
  if (toBool(text(form, "activate") ?? "")) {
    const row = await sourceRow(ctx, id);
    const problem = row ? await activationCheck(ctx, row) : T.notFound;
    if (problem) message = T.createdNotActivated(problem);
    else {
      const r = await ctx.store.setStatus(id, row!.version, "activate", null, auditCtx(ctx));
      message = r.ok ? T.createdActive : T.createdNotActivated(T.invalidTransition.activate);
      if (r.ok) version = r.value.version;
    }
  }
  if (pending > 0) message = `${message} ${T.pendingApproval(pending)}.`;
  refresh(id);
  return done(message, { id, version, pending });
}
