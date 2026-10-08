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
import { createApprovals, supabaseApprovalsPort, type ApprovalRow } from "@/lib/approvals";
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
  consumptionSchema,
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
import {
  analyzeEventLink,
  analyzeLink,
  type AnalyzeError,
  type AnalyzeResult,
} from "@/lib/sources/analyze";
import { previewActivationProblem } from "@/lib/agenda/preview";
import { collectEventSource, previewEventSource } from "@/lib/db/agenda-collect";
import { eventConfigFromRow, eventPatch, parseEventSourceForm } from "@/lib/sources/event-source";
import { EVENT_ACTION_TEXT as EV, EVENT_FORM_TEXT } from "@/content/pt-BR/sources-admin-events";
import { EXTRACT_KIND_TEXT, RUN_STATUS_TEXT } from "@/content/pt-BR/studio-agenda";
import { conflictState, type ActionState } from "@/lib/sources/action-state";
import { crawlDeps } from "@/lib/sources/http-deps";
import { validateLogo } from "@/lib/sources/logo";
import { runSourceLogoSync } from "@/lib/db/source-logo-run";
import { testConnection } from "@/lib/sources/test-connection";
import {
  ANALYZE_TEXT,
  APPROVAL_ERROR_TEXT,
  clockTime,
  CRITICAL_FIELD_TEXT,
  SOURCE_ACTION_TEXT as T,
} from "@/content/pt-BR/sources-admin";

export type { ActionState } from "@/lib/sources/action-state";

const NEXT = "/estudio/control/fontes";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600;

/** Limites por pessoa (spec §10). Escrita geral é folgada: protege contra laço, não contra uso. */
const LIMITS = {
  write: { bucket: "source_admin_write", limit: 120, windowSec: HOUR },
  analyze: { bucket: "source_admin_analyze", limit: 10, windowSec: HOUR },
  test: { bucket: "source_admin_test", limit: 30, windowSec: HOUR },
  approve: { bucket: "source_admin_approve", limit: 60, windowSec: HOUR },
  /** "Coletar agora" de fonte de eventos (coleta real, com IA): 6 por hora por pessoa. */
  collectEvents: { bucket: "source_admin_collect_events", limit: 6, windowSec: HOUR },
} as const;

const fail = (message: string, fieldErrors?: Record<string, string>): ActionState =>
  fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };
const done = (message: string, data?: unknown): ActionState =>
  data === undefined ? { ok: true, message } : { ok: true, message, data };

// ---------------------------------------------------------------------------
// Contexto comum
// ---------------------------------------------------------------------------

interface Ctx {
  /** Alguma auditoria complementar falhou depois de gravar (relatada na mensagem, achado 6). */
  auditFailed: boolean;
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
    auditFailed: false,
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

/**
 * Auditoria complementar (aprovações, coletar agora, teste, análise). Roda depois de a escrita
 * principal já ter sido gravada: se falhar, não desfaz nem esconde o sucesso — registra no log do
 * servidor e a mensagem avisa (achado 6 da revisão FS-T6).
 */
async function safeAudit(ctx: Ctx, entry: Parameters<SourceAdminStore["audit"]>[0]) {
  try {
    await ctx.store.audit(entry);
    return true;
  } catch (e) {
    ctx.auditFailed = true;
    console.error(`painel de fontes: auditoria ${entry.action} falhou`, e);
    return false;
  }
}

/** Sucesso, com o aviso de auditoria quando ela falhou. */
function finish(ctx: Ctx, message: string, data?: unknown): ActionState {
  const text = ctx.auditFailed ? `${message} ${T.auditFailed}` : message;
  return done(text, data === undefined ? undefined : data);
}

function refresh(id?: string) {
  revalidatePath(NEXT, "layout");
  if (id) revalidatePath(`${NEXT}/${id}`, "layout");
}

/**
 * O portal lê `public_sources`/`public_aggregated` pela cache da home (tag `home`, 60 s): status,
 * score editorial, nome exibido e recomendação mudam o Panorama na hora, não no próximo minuto
 * (spec §7.3, D-F9; FS-T9). Falha da cache nunca derruba a ação.
 */
async function refreshPortal() {
  try {
    await revalidateTags(["home"]);
  } catch (e) {
    console.error("painel de fontes: revalidação da home falhou", e);
  }
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
      return conflictState(await conflictMessage(ctx, id));
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

const BOOL_FIELDS = [
  "maySoleSource",
  "recPinned",
  "recLocalHighlight",
  "recExcluded",
  "trusted",
] as const;
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
/** "site.example/feed" vira "https://site.example/feed"; esquema explícito é mantido (e checado). */
const withScheme = (v: string): string =>
  /^[a-z][a-z0-9+.-]*:/i.test(v.trim()) ? v.trim() : `https://${v.trim()}`;
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
  // URLs que o pipeline executa ou que a tela mostra como link: mesma régua do endereço base
  // (achado 2 da revisão FS-T6). `crawlGet` revalida na coleta, mas lixo não entra no banco.
  const data: Partial<SourceConfig> = { ...(parsed.data as Partial<SourceConfig>) };
  for (const key of ["feedUrl", "termsUrl"] as const) {
    const value = data[key];
    if (typeof value !== "string") continue;
    const checked = normalizePastedUrl(withScheme(value));
    if (checked.ok) data[key] = checked.value.toString();
    else errors[key] = ANALYZE_TEXT.errors[checked.error];
  }
  const sel = parsed.data.pageSelectors;
  if (
    sel &&
    ![sel.item, sel.link, sel.title, ...(sel.date ? [sel.date] : [])].every(isSafeSelector)
  )
    errors.pageSelectors = T.invalid;
  return { patch: data, errors };
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

/** `source:<id>:<campo>=<valor>` → `{ field, value }` (snake, texto) para a auditoria. */
function targetParts(ref: string) {
  const t = parseSourceTarget(ref);
  return t ? { field: t.field, value: t.value } : { field: "", value: "" };
}

interface CriticalOutcome {
  /** Campos (snake) aprovados e aplicados nesta ação (A-128: quem pede e pode aprovar aplica). */
  applied: string[];
  /** Campos (snake) com pedido pendente (novo ou já existente). */
  pending: string[];
  /** Campos (snake) cujo pedido não pôde ser gravado ou aplicado. */
  failed: string[];
}

const NO_CRITICAL: CriticalOutcome = { applied: [], pending: [], failed: [] };

/**
 * Registra o pedido de cada mudança crítica (D-F3), sem duplicar um pedido pendente idêntico, e
 * audita `source.approval_requested` com o valor de antes (a checagem de pedido obsoleto só
 * confia nessa linha quando ela é da própria pessoa que pediu). A-128: quem tem
 * `source.approve_critical` aprova e aplica na mesma ação (`approveAndApplyCritical`), e a
 * auditoria guarda quem pediu e quem aprovou. Nunca pula uma falha em silêncio nem lança depois
 * de outras escritas: devolve o que foi aplicado, o que ficou pendente e o que falhou (achado 5
 * da revisão FS-T6).
 */
async function requestCritical(
  ctx: Ctx,
  sourceId: string,
  changes: { targetRef: string; from: unknown }[],
  justification: string,
): Promise<CriticalOutcome> {
  const out: CriticalOutcome = { applied: [], pending: [], failed: [] };
  const approvals = createApprovals(ctx.db);
  const port = supabaseApprovalsPort(ctx.db);
  const canApprove = can(ctx.roles, "source.approve_critical");
  const settle = async (field: string, approvalId: string) => {
    if (!canApprove) {
      out.pending.push(field);
      return;
    }
    let row: ApprovalRow | null = null;
    try {
      row = await port.get(approvalId);
    } catch (e) {
      console.error("painel de fontes: leitura da aprovação falhou", approvalId, e);
    }
    const r = row ? await approveAndApplyCritical(ctx, row) : null;
    if (r?.ok) out.applied.push(field);
    else if (row && (await port.get(approvalId).catch(() => null))?.status === "pending")
      out.pending.push(field);
    else out.failed.push(field);
  };
  let open: { id: string; targetRef: string }[] = [];
  try {
    open = await approvals.pending(`source:${sourceId}:`);
  } catch (e) {
    console.error("painel de fontes: leitura de aprovações pendentes falhou", e);
  }
  for (const c of changes) {
    const { field, value } = targetParts(c.targetRef);
    const existing = open.find((a) => a.targetRef === c.targetRef);
    if (existing) {
      await settle(field, existing.id);
      continue;
    }
    let approvalId: string | null = null;
    try {
      const r = await approvals.requestApproval({
        kind: "source.critical",
        targetRef: c.targetRef,
        justification,
      });
      if (r.ok) approvalId = r.value.id;
    } catch (e) {
      console.error("painel de fontes: pedido de aprovação falhou", c.targetRef, e);
    }
    if (!approvalId) {
      out.failed.push(field);
      continue;
    }
    await safeAudit(ctx, {
      actor: ctx.userId,
      action: "source.approval_requested",
      objectRef: `source:${sourceId}`,
      details: { approvalId, field, from: c.from, to: value, justification },
      ipHash: ctx.ipHash,
    });
    await settle(field, approvalId);
  }
  return out;
}

/** Mensagem exata do que foi salvo ou aplicado, do que aguarda aprovação e do que falhou. */
function criticalMessage(saved: boolean, outcome: CriticalOutcome): ActionState["message"] {
  const parts: string[] = [];
  const pending = outcome.pending.length;
  const applied = outcome.applied.length > 0;
  if (saved && pending > 0) parts.push(T.savedWithPending(pending));
  else if (pending > 0) parts.push(T.pendingApproval(pending));
  else if (applied) parts.push(T.appliedCritical);
  else if (saved) parts.push(T.saved);
  const msg = parts.join("");
  if (outcome.failed.length === 0) return msg;
  const names = outcome.failed.map((f) => CRITICAL_FIELD_TEXT[f] ?? f).join(", ");
  return `${msg ? `${msg}. ` : ""}${T.approvalRequestFailed(names)}`;
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
  // Só o que AFROUXA vai para aprovação; restringir um campo crítico aplica na hora (D-F3).
  const nonCritical = changes.filter((c) => !critical.some((k) => k.field === c.field));
  if (changes.length === 0) return finish(ctx, T.nothingToSave, { version: row.version });

  const justification = text(form, "justification")?.trim() ?? "";
  if (critical.length > 0 && !justification)
    return fail(T.justificationRequired, { justification: T.justificationRequired });
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));

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

  const outcome =
    critical.length > 0
      ? await requestCritical(
          ctx,
          id,
          critical.map((c) => ({ targetRef: targetRefFor(id, c), from: c.from })),
          justification,
        )
      : NO_CRITICAL;
  if (outcome.applied.length > 0) {
    const fresh = await sourceRow(ctx, id);
    if (fresh) newVersion = fresh.version;
  }
  refresh(id);
  if (nonCritical.length > 0 || outcome.applied.length > 0) await refreshPortal();
  const message = criticalMessage(nonCritical.length > 0, outcome);
  const data = {
    version: newVersion,
    saved: nonCritical.map((c) => c.field),
    applied: outcome.applied,
    pending: outcome.pending.length,
    failed: outcome.failed,
  };
  if (outcome.failed.length > 0) return fail(message);
  return finish(ctx, message, data);
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

/**
 * Aprova (se pendente) e aplica uma mudança crítica de fonte. O trigger `guard_source_changes`
 * consome a aprovação (`applied`). Quem pediu pode ser quem aprova (A-128); a auditoria
 * `source.approval_applied` guarda os dois. Recusa o pedido obsoleto (§7.5.5).
 */
async function approveAndApplyCritical(
  ctx: Ctx,
  approval: ApprovalRow,
): Promise<{ ok: true; version: number } | { ok: false; message: string }> {
  const target = parseSourceTarget(approval.targetRef);
  if (!target) return { ok: false, message: T.invalid };
  const approvals = createApprovals(ctx.db);
  const objectRef = `source:${target.sourceId}`;
  const row = await sourceRow(ctx, target.sourceId);
  if (!row) return { ok: false, message: T.notFound };

  if (approval.status !== "pending" && approval.status !== "approved")
    return { ok: false, message: APPROVAL_ERROR_TEXT.not_pending };

  {
    // Obsoleto (§7.5.5): o campo mudou entre o pedido e a aprovação. Vale também para um pedido
    // já aprovado cuja aplicação falhou (conflito, banco fora): sem esta checagem, ele ficava
    // aplicável mesmo depois de o campo ter sido restringido de novo (achado I-4 da revisão final;
    // o banco também deixa de consumir aprovação com mais de 24 h).
    const { data: asked } = await ctx.db
      .from("audit_log_view")
      .select("details")
      .eq("object_ref", objectRef)
      .eq("action", "source.approval_requested")
      .eq("details->>approvalId", approval.id)
      // Só a linha da própria pessoa que pediu (a política de audit_log exige actor = auth.uid()):
      // ninguém mais no Estúdio consegue forjar o "valor de antes" (achado 6).
      .eq("actor", approval.requestedBy)
      .order("id")
      .limit(1)
      .maybeSingle();
    const from = (asked?.details as { from?: unknown } | undefined)?.from;
    const expected =
      target.field === "status" ? "blocked" : from === undefined ? null : String(from);
    if (expected !== null && currentText(row, target.field) !== expected) {
      const reason = T.approval.obsoleteReason;
      // Decisão já tomada é final no banco (`guard_approvals`): um pedido aprovado obsoleto só
      // deixa de ser aplicado (e expira em 24 h); o pendente é recusado de vez.
      if (approval.status === "pending") await approvals.reject({ id: approval.id, reason });
      await safeAudit(ctx, {
        actor: ctx.userId,
        action: "source.approval_rejected",
        objectRef,
        details: {
          approvalId: approval.id,
          field: target.field,
          to: target.value,
          reason,
          obsolete: true,
        },
        ipHash: ctx.ipHash,
      });
      refresh(target.sourceId);
      return { ok: false, message: T.approval.obsolete };
    }
    if (approval.status === "pending") {
      const r = await approvals.approve({ id: approval.id });
      if (!r.ok) return { ok: false, message: APPROVAL_ERROR_TEXT[r.error] };
    }
  }

  // Aplica com a aprovação: o trigger `guard_source_changes` consome (`applied`).
  const ctxAudit = auditCtx(ctx, { reason: approval.justification, approvalId: approval.id });
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
  if (!applied.ok) return { ok: false, message: T.approval.notApplied };

  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.approval_applied",
    objectRef,
    details: {
      approvalId: approval.id,
      requestedBy: approval.requestedBy,
      approvedBy: ctx.userId,
      field: target.field,
      to: target.value,
      justification: approval.justification,
    },
    ipHash: ctx.ipHash,
  });
  refresh(target.sourceId);
  return { ok: true, version: applied.value.version };
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
  if (!can(ctx.roles, "source.approve_critical")) return fail(APPROVAL_ERROR_TEXT.forbidden);

  const target = parseSourceTarget(approval.targetRef);
  if (!target) return fail(T.invalid);

  if (decision === "reject") {
    const reason = text(form, "reason")?.trim() ?? "";
    if (!reason) return fail(T.reasonRequired, { reason: T.reasonRequired });
    const r = await createApprovals(ctx.db).reject({ id, reason });
    if (!r.ok) return fail(APPROVAL_ERROR_TEXT[r.error]);
    await safeAudit(ctx, {
      actor: ctx.userId,
      action: "source.approval_rejected",
      objectRef: `source:${target.sourceId}`,
      details: { approvalId: id, field: target.field, to: target.value, reason },
      ipHash: ctx.ipHash,
    });
    refresh(target.sourceId);
    return finish(ctx, T.approval.rejected);
  }

  const r = await approveAndApplyCritical(ctx, approval);
  if (!r.ok) return fail(r.message);
  return finish(ctx, T.approval.approved, { version: r.version });
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

/** Teste de conexão da fonte com a cota por pessoa (FS-T3: `callerId`). */
function runTest(ctx: Ctx, row: Row) {
  return testConnection(
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
}

/**
 * Grava o `Crawl-delay` lido pelo próprio servidor (teste de conexão e ativação, spec §7.8.1) em
 * `consumption.robots` quando mudou. Devolve a versão atual da fonte (a mesma, se nada mudou).
 */
async function recordCrawlDelay(ctx: Ctx, row: Row, crawlDelaySec: number | null) {
  const consumption = (row.consumption ?? {}) as Record<string, unknown>;
  const robots = (consumption.robots ?? {}) as Record<string, unknown>;
  if ((robots.crawlDelaySec ?? null) === crawlDelaySec) return row.version;
  const r = await ctx.store.update(
    row.id,
    row.version,
    {
      consumption: {
        ...consumption,
        robots: { ...robots, crawlDelaySec, checkedAt: ctx.now.toISOString() },
      },
    },
    auditCtx(ctx, { reason: "Crawl-delay lido do robots.txt" }),
  );
  return r.ok ? r.value.version : row.version;
}

/**
 * Ativar/retomar (§7.3): robots.txt e teste de conexão antes de `active`; o `Crawl-delay` lido
 * fica gravado. Termos revisados deixaram de ser exigidos (A-127): a caixa só registra quando
 * foram revisados. Devolve o problema (texto) ou a versão para o `setStatus`.
 */
async function activationCheck(
  ctx: Ctx,
  row: Row,
): Promise<{ problem: string } | { version: number }> {
  if (row.kind === "events") return eventActivationCheck(row);
  const result = await runTest(ctx, row);
  if (!result.ok) return { problem: result.message };
  return { version: await recordCrawlDelay(ctx, row, result.crawlDelaySec) };
}

/**
 * Ativar/retomar fonte de eventos (AGM-T6, spec §5.1): roda a prévia (robots.txt, leitura da
 * fonte e checagens de cada evento) e só libera com ao menos 1 evento aprovado. Termos seguem a
 * régua das notícias (A-127: a caixa só registra quando foram revisados).
 */
async function eventActivationCheck(row: Row): Promise<{ problem: string } | { version: number }> {
  const preview = await previewEventSource(row.id);
  if (!preview.ok) return { problem: EV.previewFailed };
  const problem = previewActivationProblem(preview.value);
  if (!problem) return { version: row.version };
  const text = EV.problem[problem.code];
  return { problem: problem.detail ? `${text} (${problem.detail})` : text };
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
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));
  const reason = text(form, "reason")?.trim() ?? "";

  if (action === "unblock") {
    if (row.status !== "blocked") return fail(T.invalidTransition.unblock);
    const justification = text(form, "justification")?.trim() ?? "";
    if (!justification)
      return fail(T.justificationRequired, { justification: T.justificationRequired });
    const outcome = await requestCritical(
      ctx,
      id,
      [{ targetRef: `source:${id}:status=paused`, from: "blocked" }],
      justification,
    );
    refresh(id);
    if (outcome.failed.length > 0) return fail(criticalMessage(false, outcome));
    if (outcome.applied.length > 0) {
      await refreshPortal();
      const fresh = await sourceRow(ctx, id);
      return finish(ctx, T.status.unblocked, { pending: 0, version: fresh?.version });
    }
    return finish(ctx, T.status.unblockRequested, { pending: 1 });
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
  let currentVersion = version;
  if (
    (action === "activate" || action === "resume") &&
    row.status === "paused" &&
    !row.archived_at
  ) {
    const checked = await activationCheck(ctx, row);
    if ("problem" in checked) return fail(checked.problem);
    currentVersion = checked.version;
  }

  const r = await ctx.store.setStatus(
    id,
    currentVersion,
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
    // A spec não diz o que fazer se a remoção falhar: o bloqueio fica (reduz risco, vale na hora)
    // e a falha é relatada alto — ok:false, log e `source.takedown_failed` na auditoria. Bloquear
    // de novo com "Pedido do veículo" repete a remoção (achado 4 da revisão FS-T6).
    let removed: Awaited<ReturnType<typeof takedownReproduction>> | null = null;
    let failure: string | null = null;
    try {
      removed = await takedownReproduction(
        takedownDeps(),
        { sourceId: id },
        ctx.userId,
        "Pedido do veículo (opt-out)",
      );
      if (!removed.ok) failure = removed.error;
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }
    if (failure !== null || !removed?.ok) {
      console.error("painel de fontes: remoção das reproduções (opt-out) falhou", id, failure);
      await safeAudit(ctx, {
        actor: ctx.userId,
        action: "source.takedown_failed",
        objectRef: `source:${id}`,
        details: { reason: "opt_out", error: failure },
        ipHash: ctx.ipHash,
      });
      refresh(id);
      return fail(T.status.blockOptOutTakedownFailed);
    }
    message = T.status.blockOptOut(removed.value.blocked);
  }
  refresh(id);
  await refreshPortal();
  return finish(ctx, message, { version: r.value.version });
}

export async function activateSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  let version = toInt(text(form, "version") ?? "");
  let row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));
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
  const checked = await activationCheck(ctx, row);
  if ("problem" in checked) return fail(checked.problem);
  const r = await ctx.store.setStatus(id, checked.version, "activate", null, auditCtx(ctx));
  if (!r.ok) return storeFailure(ctx, id, r.error);
  refresh(id);
  return finish(ctx, T.status.activate, { version: r.value.version });
}

// ---------------------------------------------------------------------------
// Testar conexão, coletar agora (§7.4)
// ---------------------------------------------------------------------------

export async function testConnectionAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.test))) return fail(T.test.rateLimited);
  const row = await sourceRow(ctx, text(form, "id") ?? "");
  if (!row) return fail(T.notFound);
  if (row.kind === "events") return testEventSource(ctx, row);
  const result = await runTest(ctx, row);
  // O teste também grava o Crawl-delay que o servidor leu (spec §7.8.1), quando o robots respondeu.
  if (result.ok) await recordCrawlDelay(ctx, row, result.crawlDelaySec);
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.test",
    objectRef: `source:${row.id}`,
    details: { ok: result.ok, status: result.status, items: result.items, ms: result.ms },
    ipHash: ctx.ipHash,
  });
  return result.ok ? finish(ctx, result.message, result) : fail(result.message);
}

/** "Testar conexão" de fonte de eventos: a prévia com evidência (até 5 eventos), sem gravar nada. */
async function testEventSource(ctx: Ctx, row: Row): Promise<ActionState> {
  const r = await previewEventSource(row.id);
  if (!r.ok) {
    await safeAudit(ctx, {
      actor: ctx.userId,
      action: "source.test",
      objectRef: `source:${row.id}`,
      details: { ok: false, kind: "events" },
      ipHash: ctx.ipHash,
    });
    return fail(EV.previewFailed);
  }
  const p = r.value;
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.test",
    objectRef: `source:${row.id}`,
    details: {
      ok: p.status === "ok",
      kind: "events",
      status: p.status,
      found: p.found,
      approved: p.approved,
      rejected: p.rejected.length,
      aiPages: p.aiPages,
    },
    ipHash: ctx.ipHash,
  });
  const problem = previewActivationProblem(p);
  const message =
    problem && problem.code !== "no_events"
      ? EV.problem[problem.code]
      : EV.previewDone(p.approved, p.found - p.approved);
  // A prévia volta inteira (até 5 eventos com trechos e as recusas) para a tela mostrar.
  return problem && problem.code !== "no_events"
    ? { ok: false, message, data: p }
    : finish(ctx, message, p);
}

/** "Coletar agora" de fonte de eventos: coleta real só desta fonte, gravando a execução. */
async function collectEventsNow(ctx: Ctx, row: Row): Promise<ActionState> {
  if (row.archived_at || (row.status !== "active" && row.status !== "degraded"))
    return fail(T.collectNow.notActive);
  if (!(await allow(ctx, LIMITS.collectEvents))) return fail(EV.collectRateLimited);
  const r = await collectEventSource(row.id);
  if (!r.ok) return fail(T.unavailable);
  const rep = r.value;
  const rejected = Object.values(rep.rejected).reduce((n, v) => n + (v ?? 0), 0);
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.collect_now",
    objectRef: `source:${row.id}`,
    details: {
      kind: "events",
      status: rep.status,
      found: rep.found,
      approved: rep.approved,
      new: rep.new,
      updated: rep.updated,
      rejected,
      aiPages: rep.aiPages,
    },
    ipHash: ctx.ipHash,
  });
  refresh(row.id);
  if (rep.status !== "ok")
    return fail(
      EV.collectFailed(
        rep.detail ? `${RUN_STATUS_TEXT[rep.status]} (${rep.detail})` : RUN_STATUS_TEXT[rep.status],
      ),
    );
  return finish(ctx, EV.collected(rep.new, rep.updated, rejected), { report: rep });
}

export async function collectNowAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  const row = await sourceRow(ctx, text(form, "id") ?? "");
  if (!row) return fail(T.notFound);
  if (row.kind === "events") return collectEventsNow(ctx, row);
  const r = await collectNow(row.id, defaultCollectNowDeps(ctx.userId));
  if (!r.ok) {
    if (r.error === "not_active") return fail(T.collectNow.notActive);
    if (r.error === "rate_limited") return fail(T.collectNow.rateLimited);
    return fail(T.notFound);
  }
  // `collectNow` não audita (FS-T5): a auditoria da pessoa fica aqui.
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.collect_now",
    objectRef: `source:${row.id}`,
    details: { runId: r.value.runId },
    ipHash: ctx.ipHash,
  });
  refresh(row.id);
  return finish(ctx, T.collectNow.queued, { runId: r.value.runId });
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
  await refreshPortal();
  const fast =
    frequencyMinutes !== null && (FAST_FREQUENCIES as readonly number[]).includes(frequencyMinutes);
  return finish(ctx, bulkMessage(action, fast, r.value.items), r.value);
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
  return finish(ctx, T.defaultFrequency.saved, { value: parsed.data });
}

export async function setFastLaneMaxAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const parsed = fastLaneMaxSchema.safeParse(toInt(text(form, "value") ?? ""));
  if (!parsed.success) return fail(T.fastLaneMax.invalid, { value: T.fastLaneMax.invalid });
  const r = await ctx.store.setFastLaneMax(parsed.data, auditCtx(ctx));
  if (!r.ok) return fail(r.error === "forbidden" ? T.forbidden : T.fastLaneMax.invalid);
  refresh();
  return finish(ctx, T.fastLaneMax.saved, { value: parsed.data });
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
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));
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
  if (!r.ok) {
    // A versão mudou (ou a escrita falhou) entre a checagem e a gravação: nada de órfão no bucket.
    await ctx.store.removeLogo(up.value.path);
    return storeFailure(ctx, id, r.error);
  }
  refresh(id);
  return finish(ctx, T.logo.saved, { version: r.value.version, path: up.value.path });
}

/**
 * Remover logotipo (a pedido da fonte, R27): apaga `logo_path`, o monograma volta e, como a mudança
 * vem do painel, a fonte fica `manual` (a busca automática não repõe). O arquivo sai do bucket.
 */
export async function removeLogoAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const version = toInt(text(form, "version") ?? "");
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));
  if (!row.logo_path) return fail(T.logo.removeNone);
  const r = await ctx.store.update(
    id,
    version,
    { logoPath: null },
    auditCtx(ctx, { reason: "logotipo removido" }),
  );
  if (!r.ok) return storeFailure(ctx, id, r.error);
  await ctx.store.removeLogo(row.logo_path);
  refresh(id);
  await refreshPortal();
  return finish(ctx, T.logo.removed, { version: r.value.version });
}

/**
 * "Buscar logo" (R27): procura o logotipo na internet para esta fonte, grava no bucket e atualiza
 * a fonte (`logo_source = 'auto'`). Logotipo definido por pessoa nunca é trocado.
 */
export async function discoverLogoAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.analyze))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  const M = T.logo.discover;
  if (row.logo_source === "manual") return fail(M.manual);
  let item;
  try {
    item = (
      await runSourceLogoSync({ sourceId: id, limit: 1, signal: AbortSignal.timeout(50_000) })
    ).processed[0];
  } catch {
    return fail(M.error);
  }
  if (!item) return fail(M.unreachable);
  refresh(id);
  switch (item.outcome) {
    case "found": {
      await refreshPortal();
      let host = "";
      try {
        host = new URL(item.origin ?? "").hostname;
      } catch {
        /* sem host legível */
      }
      return done(M.found(host));
    }
    case "none":
      return fail(M.none);
    case "robots":
      return fail(M.robots);
    case "unreachable":
      return fail(M.unreachable);
    case "skipped_manual":
      return fail(M.manual);
    default:
      return fail(M.error);
  }
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
  const value: AnalyzeResult = r.value;
  if (value.status === "duplicate") {
    await safeAudit(ctx, {
      actor: ctx.userId,
      action: "source.analyze",
      objectRef: `source:${value.duplicate.id}`,
      details: { inputUrl: input, duplicateOf: value.duplicate.id },
      ipHash: ctx.ipHash,
    });
    return finish(
      ctx,
      value.duplicate.archived
        ? ANALYZE_TEXT.duplicateArchived
        : ANALYZE_TEXT.duplicate(value.duplicate.name),
      value,
    );
  }
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.analyze",
    objectRef: `discovery:${value.discoveryId}`,
    details: { inputUrl: input, strategy: value.discovery.strategy, aiStatus: value.aiStatus },
    ipHash: ctx.ipHash,
  });
  return finish(ctx, ANALYZE_TEXT.done, value);
}

/**
 * Robots, cadência e registro da descoberta gravados pelo servidor na análise (`analyzeLink`),
 * só de uma descoberta da própria pessoa. É daqui — nunca do formulário — que vem o
 * `Crawl-delay` que eleva a frequência efetiva (spec §7.8.1).
 */
async function trustedDiscovery(
  ctx: Ctx,
  id: string,
): Promise<{ robots: unknown; cadence: unknown; discovery: unknown } | null> {
  const { data } = await ctx.db
    .from("source_discoveries")
    .select("suggestion, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.created_by !== ctx.userId) return null;
  const c = ((data.suggestion as { consumption?: Record<string, unknown> } | null)?.consumption ??
    {}) as Record<string, unknown>;
  const robots = c.robots as { crawlDelaySec?: unknown } | undefined;
  const delay = robots?.crawlDelaySec;
  return {
    robots: {
      ...(robots ?? {}),
      crawlDelaySec: typeof delay === "number" && delay >= 0 ? delay : null,
    },
    cadence: c.cadence ?? null,
    discovery: c.discovery ?? null,
  };
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
    trusted: false,
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

  // `consumption` do formulário nunca é confiável (achado 3): só passa pelo schema, e robots,
  // cadência e o registro da descoberta vêm da análise que o próprio servidor gravou.
  const rawConsumption = text(form, "consumption");
  if (rawConsumption) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(rawConsumption);
    } catch {
      /* cai no erro abaixo */
    }
    if (!consumptionSchema.safeParse(parsed).success)
      return fail(T.invalid, { consumption: T.invalid });
  }
  const discoveryId = text(form, "discoveryId");
  const trusted =
    discoveryId && UUID.test(discoveryId) ? await trustedDiscovery(ctx, discoveryId) : null;
  const consumption: Record<string, unknown> = {
    strategy: restricted.strategy,
    feedUrl: restricted.feedUrl,
    pageSelectors: restricted.pageSelectors,
    robots: trusted?.robots ?? { crawlDelaySec: null },
    ...(trusted?.discovery ? { discovery: trusted.discovery } : {}),
    ...(trusted?.cadence ? { cadence: trusted.cadence } : {}),
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
  const problems: string[] = [];
  if (Object.keys(followUp).length > 0) {
    const r = await ctx.store.update(id, version, followUp, auditCtx(ctx));
    if (r.ok) version = r.value.version;
    else problems.push(T.createdFollowUpFailed);
  }

  if (trusted && discoveryId) {
    const accepted = form
      .getAll("acceptedFields")
      .filter((v): v is string => typeof v === "string" && /^[a-zA-Z]{1,40}$/.test(v));
    await ctx.db.rpc("source_discovery_link", {
      p_id: discoveryId,
      p_source: id,
      p_accepted: accepted,
    });
  }

  const outcome =
    critical.length > 0
      ? await requestCritical(
          ctx,
          id,
          critical.map((c) => ({ targetRef: targetRefFor(id, c), from: c.from })),
          justification,
        )
      : NO_CRITICAL;
  if (outcome.applied.length > 0) {
    const fresh = await sourceRow(ctx, id);
    if (fresh) version = fresh.version;
  }

  let message: string = T.created;
  if (toBool(text(form, "activate") ?? "")) {
    const row = await sourceRow(ctx, id);
    const checked = row ? await activationCheck(ctx, row) : { problem: T.notFound };
    if ("problem" in checked) message = T.createdNotActivated(checked.problem);
    else {
      const r = await ctx.store.setStatus(id, checked.version, "activate", null, auditCtx(ctx));
      message = r.ok ? T.createdActive : T.createdNotActivated(T.invalidTransition.activate);
      if (r.ok) version = r.value.version;
    }
  }
  if (outcome.pending.length > 0)
    message = `${message} ${T.pendingApproval(outcome.pending.length)}.`;
  else if (outcome.applied.length > 0) message = `${message} ${T.appliedCritical}`;
  if (outcome.failed.length > 0)
    problems.push(criticalMessage(false, { ...outcome, pending: [], applied: [] }));
  refresh(id);
  const data = { id, version, pending: outcome.pending.length, failed: outcome.failed };
  // A fonte foi criada: com falha depois disso, a mensagem diz o que ficou faltando.
  if (problems.length > 0) return { ok: false, message: `${message} ${problems.join(" ")}` };
  return finish(ctx, message, data);
}

// ---------------------------------------------------------------------------
// Fontes de eventos (AGM-T6, spec 2026-10-08 §5.1)
// ---------------------------------------------------------------------------

/** Análise do link de uma agenda: Tribe, iCal, RSS ou JSON-LD antes de sugerir `ai_page`. */
export async function analyzeEventLinkAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  const input = (text(form, "url") ?? "").trim();
  if (!input) return fail(ANALYZE_TEXT.errors.invalid, { url: ANALYZE_TEXT.errors.invalid });
  if (!(await allow(ctx, LIMITS.analyze))) {
    const msg = ANALYZE_TEXT.errors.rate_limited(60 - ctx.now.getUTCMinutes());
    return fail(msg, { url: msg });
  }
  const svc = createServiceClient();
  const r = await analyzeEventLink(input, {
    crawl: crawlDeps({ repo: createIngestRepo(svc) }),
    isEnabled: async (key) => {
      const { data } = await svc
        .from("feature_flags")
        .select("enabled")
        .eq("key", key)
        .maybeSingle();
      return data?.enabled === true;
    },
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
  });
  if (!r.ok) {
    const msg = analyzeMessage(r.error, input, ctx.now);
    return fail(msg, { url: msg });
  }
  const value = r.value;
  if (value.status === "duplicate")
    return finish(
      ctx,
      value.duplicate.archived
        ? ANALYZE_TEXT.duplicateArchived
        : ANALYZE_TEXT.duplicate(value.duplicate.name),
      value,
    );
  await safeAudit(ctx, {
    actor: ctx.userId,
    action: "source.analyze",
    objectRef: `discovery:events:${new URL(value.url).hostname}`,
    details: { inputUrl: input, kind: "events", extractKind: value.extractKind },
    ipHash: ctx.ipHash,
  });
  const message =
    value.extractKind === "ai_page"
      ? EV.analyzeNone
      : EVENT_FORM_TEXT.analyze.done(EXTRACT_KIND_TEXT[value.extractKind]);
  return finish(ctx, message, value);
}

/** Cadastro de fonte de eventos: nasce pausada (`pending_activation`), ativação pela prévia. */
export async function createEventSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const parsed = parseEventSourceForm(form, { create: true });
  if (!parsed.ok) return fail(T.invalid, parsed.error);
  const input = parsed.value;
  const slug = input.slug ?? "";
  if (!SLUG.test(slug))
    return fail(T.invalid, { slug: "Use só letras minúsculas, números e hífen." });
  const created = await ctx.store.create(
    {
      slug,
      name: input.name,
      baseUrl: input.baseUrl ?? "",
      kind: "events",
      feedUrl: null,
      categories: [],
      locality: "cuiaba",
      layer: null,
      frequencyMinutes: null,
      rateLimitPerHour: 20,
      priority: 2,
      editorialScore: 3,
      consumption: {},
      event: input.config,
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
  if (toBool(text(form, "termsReviewed") ?? "")) {
    const r = await ctx.store.update(
      id,
      version,
      { termsReviewedAt: ctx.now.toISOString(), termsReviewedBy: ctx.userId },
      auditCtx(ctx),
    );
    if (!r.ok) {
      refresh(id);
      return { ok: false, message: `${EV.created} ${T.createdFollowUpFailed}` };
    }
    version = r.value.version;
  }
  refresh(id);
  return finish(ctx, EV.created, { id, version });
}

/** Edição da coleta de uma fonte de eventos (nome e campos de evento; endereço e slug não mudam). */
export async function updateEventSourceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.write))) return fail(T.rateLimited);
  const id = text(form, "id") ?? "";
  const version = toInt(text(form, "version") ?? "");
  const row = await sourceRow(ctx, id);
  if (!row) return fail(T.notFound);
  if (row.kind !== "events") return fail(EV.notEvents);
  if (!Number.isInteger(version)) return fail(T.invalid);
  const parsed = parseEventSourceForm(form, { create: false });
  if (!parsed.ok) return fail(T.invalid, parsed.error);
  if (row.version !== version) return conflictState(await conflictMessage(ctx, id));
  const patch: SourcePatch = {
    ...eventPatch(eventConfigFromRow(row), parsed.value.config),
    ...(parsed.value.name !== row.name ? { name: parsed.value.name } : {}),
  };
  if (Object.keys(patch).length === 0) return finish(ctx, T.nothingToSave, { version });
  const r = await ctx.store.update(
    id,
    version,
    patch,
    auditCtx(ctx, { reason: text(form, "reason")?.trim() || null }),
  );
  if (!r.ok) return storeFailure(ctx, id, r.error);
  refresh(id);
  return finish(ctx, T.saved, { version: r.value.version });
}
