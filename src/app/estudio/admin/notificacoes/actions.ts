"use server";

/**
 * Server Actions de A09 · Notificações (spec 2026-09-28 §10). Toda ação: `requireAnyRole` na
 * entrada e a checagem fina da ação (`can`/`pushKindsFor`), limite por pessoa em
 * `hit_rate_limit`, escrita pelas RPCs com a sessão da pessoa (RLS e triggers de 0041) e, nas
 * configurações, contexto de auditoria com o hash do IP (nunca o IP cru). Só POST: nenhuma rota
 * GET muda estado. Aprovar exige `push.approve` no banco mesmo que este arquivo seja contornado;
 * A-128: quem pede e tem `push.approve` aprova na mesma ação, e o histórico registra quem fez.
 */
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { canAccess, type Session } from "@/lib/auth";
import { requireAnyRole, requireRole } from "@/lib/auth/require-role";
import { createServerClient, type DbClient } from "@/lib/db/client";
import {
  createPushAdminStore,
  PUSH_SETTING_KEYS,
  type PushAdminError,
  type PushAdminStore,
  type PushSettingKey,
} from "@/lib/db/push-admin-store";
import { audienceEstimate, pushSettings, searchArticles } from "@/lib/db/queries/push-admin";
import type { Json } from "@/lib/db/types";
import { hitRateLimit } from "@/lib/db/writes";
import { asScope, isEligibleForFeature } from "@/lib/geo/news-scope";
import { PUSH_ACTIONS, pushKindsFor } from "@/lib/push/permissions";
import { cuiabaLocalToIso, scheduleProblem } from "@/lib/push/rules";
import { audienceSchema, pushRequestSchema } from "@/lib/push/schemas";
import { BODY_MAX, sanitizeNotificationText, TITLE_MAX } from "@/lib/push/text";
import type { PushKind } from "@/lib/push/types";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import type { ActionState } from "@/lib/sources/action-state";
import { PUSH_ADMIN_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { PUSH_ADMIN_PATH } from "../../nav";

export type { ActionState } from "@/lib/sources/action-state";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HOUR = 3600;

const LIMITS = {
  request: { bucket: "push_admin_request", limit: 30, windowSec: HOUR },
  decide: { bucket: "push_admin_decide", limit: 60, windowSec: HOUR },
  settings: { bucket: "push_admin_settings", limit: 60, windowSec: HOUR },
  read: { bucket: "push_admin_read", limit: 240, windowSec: HOUR },
} as const;

const fail = (message: string, fieldErrors?: Record<string, string>): ActionState =>
  fieldErrors ? { ok: false, message, fieldErrors } : { ok: false, message };
const done = (message: string, data?: unknown): ActionState =>
  data === undefined ? { ok: true, message } : { ok: true, message, data };

interface Ctx {
  userId: string;
  roles: Session["roles"];
  now: Date;
  ipHash: string | null;
  db: DbClient;
  store: PushAdminStore;
}

async function context(): Promise<Ctx> {
  const session = await requireAnyRole(PUSH_ACTIONS, { next: PUSH_ADMIN_PATH });
  return build(session);
}

async function settingsContext(): Promise<Ctx> {
  const session = await requireRole("push.settings", undefined, {
    next: `${PUSH_ADMIN_PATH}/configuracoes`,
  });
  return build(session);
}

async function build(session: Session): Promise<Ctx> {
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
    store: createPushAdminStore(db),
  };
}

/** Cota por pessoa (chave com hash do id). Banco fora do ar: recusa. */
async function allow(ctx: Ctx, limit: { bucket: string; limit: number; windowSec: number }) {
  const key = createHash("sha256").update(`user:${ctx.userId}`).digest("hex");
  const r = await hitRateLimit(limit.bucket, key, limit.limit, limit.windowSec);
  return r.ok && r.value;
}

function refresh() {
  revalidatePath(PUSH_ADMIN_PATH, "layout");
  revalidatePath("/estudio", "layout");
}

const text = (form: FormData, key: string): string | undefined => {
  const v = form.get(key);
  return typeof v === "string" ? v : undefined;
};

function storeFailure(e: PushAdminError): ActionState {
  return fail(T.errors[e]);
}

// ---------------------------------------------------------------------------
// Novo envio (§10.2)
// ---------------------------------------------------------------------------

export async function requestPushAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.request))) return fail(T.errors.rateLimited);

  const kind = text(form, "kind");
  const articleId = text(form, "articleId") ?? "";
  if ((kind !== "urgent" && kind !== "highlight") || !UUID.test(articleId))
    return fail(T.errors.invalid, { articleId: T.errors.invalid });

  const errors: Record<string, string> = {};
  const audienceType = text(form, "audienceType") ?? "all";
  const audience = audienceSchema.safeParse(
    audienceType === "all"
      ? { type: "all" }
      : { type: audienceType, slug: text(form, "audienceSlug") ?? "" },
  );
  if (!audience.success) errors.audience = T.errors.invalid;

  const whenType = text(form, "whenType") ?? "now";
  let when: { type: "now" } | { type: "at"; at: string } = { type: "now" };
  if (whenType === "at") {
    const iso = cuiabaLocalToIso(text(form, "at") ?? "");
    if (!iso) errors.at = T.errors.schedule.invalid;
    else when = { type: "at", at: iso };
  }
  if (!errors.at) {
    const problem = scheduleProblem(kind, when, ctx.now.toISOString());
    if (problem) errors.at = T.errors.schedule[problem];
  }

  const justification = text(form, "justification")?.trim() ?? "";
  const parsed = pushRequestSchema.safeParse({
    kind,
    articleId,
    title: sanitizeNotificationText(text(form, "title") ?? "", TITLE_MAX),
    body: sanitizeNotificationText(text(form, "body") ?? "", BODY_MAX),
    audience: audience.success ? audience.data : { type: "all" },
    when,
    ...(justification ? { justification } : {}),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      errors[field] ??= issue.message;
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) return fail(T.errors.invalid, errors);

  // A editoria da matéria decide se a pessoa pode pedir este tipo (editor: só Destaque da sua).
  const { data: article } = await ctx.db
    .from("articles")
    .select("section_slug, status, sponsored, news_scope, national_commotion")
    .eq("id", articleId)
    .maybeSingle();
  if (!article) return fail(T.errors.article_invalid, { articleId: T.errors.article_invalid });
  if (!["published", "updated"].includes(article.status) || article.sponsored)
    return fail(T.errors.article_invalid, { articleId: T.errors.article_invalid });
  if (!pushKindsFor(ctx.roles, article.section_slug).includes(kind))
    return fail(T.errors.forbidden);
  // Urgência só local ou regional (A15): nacional sem comoção não gera push urgente.
  if (
    kind === "urgent" &&
    !isEligibleForFeature({
      newsScope: asScope(article.news_scope),
      nationalCommotion: article.national_commotion,
    })
  )
    return fail(T.errors.national_scope, { articleId: T.errors.national_scope });

  const r = await ctx.store.request(parsed.data);
  if (!r.ok) return storeFailure(r.error);
  refresh();
  // A política de avisos (0157, A-142) decide no próprio pedido: papel, limite por hora e por
  // dia e matéria no ar. Na fila, agendado ou recusado com motivo; nunca esperando pessoa.
  const { data: decided } = await ctx.db
    .from("push_sends")
    .select("status, status_reason")
    .eq("id", r.value.id)
    .maybeSingle();
  if (decided?.status === "rejected")
    return fail(T.done.policyRejected(decided.status_reason ?? ""));
  const settings = await pushSettings();
  if (settings.paused.on) return done(T.done.requestedPaused, { id: r.value.id });
  return done(decided?.status === "scheduled" ? T.done.scheduledNow : T.done.sentNow, {
    id: r.value.id,
    status: decided?.status,
  });
}

export async function estimateAudienceAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.read))) return fail(T.errors.rateLimited);
  const kind = text(form, "kind");
  if (kind !== "urgent" && kind !== "highlight") return fail(T.errors.invalid);
  const audienceType = text(form, "audienceType") ?? "all";
  const audience = audienceSchema.safeParse(
    audienceType === "all"
      ? { type: "all" }
      : { type: audienceType, slug: text(form, "audienceSlug") ?? "" },
  );
  if (!audience.success) return fail(T.errors.invalid);
  const n = await audienceEstimate(kind as PushKind, audience.data);
  if (n === null) return fail(T.errors.unavailable);
  return done(n === 0 ? T.reach.fewer : T.reach.about(n), { reach: n });
}

export async function searchArticlesAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.read))) return fail(T.errors.rateLimited);
  const items = await searchArticles(text(form, "q") ?? "", ctx.roles);
  return done("", { items });
}

// ---------------------------------------------------------------------------
// Fila e aprovações (§10.3)
// ---------------------------------------------------------------------------

async function sendRow(ctx: Ctx, id: string) {
  if (!UUID.test(id)) return null;
  const { data } = await ctx.db
    .from("push_sends")
    .select("id, status, requested_by, scheduled_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export async function decidePushAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.decide))) return fail(T.errors.rateLimited);
  const id = text(form, "id") ?? "";
  const decision = text(form, "decision");
  if (decision !== "approve" && decision !== "reject") return fail(T.errors.invalid);
  const row = await sendRow(ctx, id);
  if (!row) return fail(T.errors.not_pending);
  if (row.status !== "pending_approval") return fail(T.errors.not_pending);
  // Autoaprovação primeiro: quem pediu recebe a mensagem certa, com ou sem o papel.
  if (!canAccess(ctx.roles, "push.approve")) return fail(T.errors.forbidden);

  if (decision === "reject") {
    const reason = text(form, "reason")?.trim() ?? "";
    if (!reason) return fail(T.errors.reasonRequired, { reason: T.errors.reasonRequired });
    const r = await ctx.store.reject(id, reason);
    if (!r.ok) return storeFailure(r.error);
    refresh();
    return done(T.done.rejected);
  }
  const r = await ctx.store.approve(id);
  if (!r.ok) return storeFailure(r.error);
  refresh();
  return done(r.value.status === "scheduled" ? T.done.approvedScheduled : T.done.approved, r.value);
}

export async function cancelPushAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.decide))) return fail(T.errors.rateLimited);
  const id = text(form, "id") ?? "";
  const reason = text(form, "reason")?.trim() ?? "";
  if (!reason) return fail(T.errors.reasonRequired, { reason: T.errors.reasonRequired });
  const row = await sendRow(ctx, id);
  if (!row) return fail(T.errors.not_pending);
  if (row.requested_by !== ctx.userId && !canAccess(ctx.roles, "push.settings"))
    return fail(T.errors.forbidden);
  const r = await ctx.store.cancel(id, reason);
  if (!r.ok) return storeFailure(r.error);
  refresh();
  return done(T.done.cancelled);
}

// ---------------------------------------------------------------------------
// Configurações (§10.5)
// ---------------------------------------------------------------------------

export async function pausePushAction(form: FormData): Promise<ActionState> {
  const ctx = await settingsContext();
  if (!(await allow(ctx, LIMITS.settings))) return fail(T.errors.rateLimited);
  const reason = text(form, "reason")?.trim() ?? "";
  if (!reason) return fail(T.errors.reasonRequired, { reason: T.errors.reasonRequired });
  if ((text(form, "confirm") ?? "").trim() !== T.pauseWord)
    return fail(T.errors.typePause, { confirm: T.errors.typePause });
  const r = await ctx.store.pause(reason);
  if (!r.ok) return storeFailure(r.error);
  refresh();
  return done(T.done.paused);
}

export async function requestResumeAction(form: FormData): Promise<ActionState> {
  const ctx = await settingsContext();
  if (!(await allow(ctx, LIMITS.settings))) return fail(T.errors.rateLimited);
  const reason = text(form, "reason")?.trim() ?? "";
  if (!reason) return fail(T.errors.reasonRequired, { reason: T.errors.reasonRequired });
  const r = await ctx.store.requestResume(reason);
  if (!r.ok) return storeFailure(r.error);
  // A-128: quem pede a retomada e tem `push.approve` aprova e retoma na mesma ação.
  if (canAccess(ctx.roles, "push.approve")) {
    const a = await ctx.store.approveResume(r.value.approvalId);
    refresh();
    if (a.ok) return done(T.done.resumedNow, { approvalId: r.value.approvalId });
  }
  refresh();
  return done(T.done.resumeRequested, { approvalId: r.value.approvalId });
}

export async function approveResumeAction(form: FormData): Promise<ActionState> {
  const ctx = await context();
  if (!(await allow(ctx, LIMITS.decide))) return fail(T.errors.rateLimited);
  const id = text(form, "approvalId") ?? "";
  if (!UUID.test(id)) return fail(T.errors.invalid);
  const { data: appr } = await ctx.db
    .from("approvals")
    .select("requested_by, status, kind")
    .eq("id", id)
    .maybeSingle();
  if (!appr || appr.kind !== "push.resume" || appr.status !== "pending")
    return fail(T.errors.not_pending);
  if (!canAccess(ctx.roles, "push.approve")) return fail(T.errors.forbidden);
  const r = await ctx.store.approveResume(id);
  if (!r.ok) return storeFailure(r.error);
  refresh();
  return done(T.done.resumed);
}

const templateSchema = z
  .array(
    z.strictObject({
      name: z.string().trim().min(1, "Dê um nome ao modelo").max(40, "Nome com até 40 caracteres"),
      title: z
        .string()
        .trim()
        .min(1, "Informe o título")
        .max(TITLE_MAX, `Título com até ${TITLE_MAX} caracteres`),
      body: z
        .string()
        .trim()
        .min(1, "Informe o texto")
        .max(BODY_MAX, `Texto com até ${BODY_MAX} caracteres`),
    }),
  )
  .max(20, "No máximo 20 modelos")
  .superRefine((list, c) => {
    list.forEach((t, i) => {
      for (const field of ["title", "body"] as const) {
        const bad = t[field]
          .match(/\{[^}]*\}/g)
          ?.find((p) => p !== "{titulo}" && p !== "{linha_fina}");
        if (bad)
          c.addIssue({
            code: "custom",
            path: [i, field],
            message: `Só {titulo} e {linha_fina}: ${bad} não existe`,
          });
      }
    });
  });

const settingsSchema = z.object({
  dailyLimit: z.coerce
    .number()
    .int()
    .min(1, "Limite entre 1 e 3")
    .max(3, "Limite entre 1 e 3")
    .optional(),
  quietStart: z.coerce
    .number()
    .int()
    .min(18, "Início entre 18h e 22h")
    .max(22, "Início entre 18h e 22h")
    .optional(),
  quietEnd: z.coerce
    .number()
    .int()
    .min(7, "Fim entre 7h e 10h")
    .max(10, "Fim entre 7h e 10h")
    .optional(),
});

const KEY_OF: Record<"dailyLimit" | "quietStart" | "quietEnd" | "templates", PushSettingKey> = {
  dailyLimit: "push.default_daily_limit",
  quietStart: "push.quiet_start",
  quietEnd: "push.quiet_end",
  templates: "push.templates",
};

export async function saveSettingsAction(form: FormData): Promise<ActionState> {
  const ctx = await settingsContext();
  if (!(await allow(ctx, LIMITS.settings))) return fail(T.errors.rateLimited);
  const raw: Record<string, string> = {};
  for (const k of ["dailyLimit", "quietStart", "quietEnd"] as const) {
    const v = text(form, k);
    if (v !== undefined && v.trim() !== "") raw[k] = v.trim();
  }
  const parsed = settingsSchema.safeParse(raw);
  const errors: Record<string, string> = {};
  if (!parsed.success)
    for (const issue of parsed.error.issues)
      errors[String(issue.path[0] ?? "form")] ??= issue.message;

  let templates: z.infer<typeof templateSchema> | undefined;
  const rawTemplates = text(form, "templates");
  if (rawTemplates !== undefined) {
    let json: unknown = null;
    try {
      json = JSON.parse(rawTemplates || "[]");
    } catch {
      errors.templates = T.errors.invalid;
    }
    if (!errors.templates) {
      const t = templateSchema.safeParse(json);
      if (t.success) templates = t.data;
      else errors.templates = t.error.issues[0]?.message ?? T.errors.invalid;
    }
  }
  if (Object.keys(errors).length > 0) return fail(T.errors.invalid, errors);

  const current = await pushSettings();
  const writes: { key: PushSettingKey; value: Json }[] = [];
  const p = parsed.success ? parsed.data : {};
  if (p.dailyLimit !== undefined && p.dailyLimit !== current.dailyLimit)
    writes.push({ key: KEY_OF.dailyLimit, value: p.dailyLimit });
  if (p.quietStart !== undefined && p.quietStart !== current.quietStart)
    writes.push({ key: KEY_OF.quietStart, value: p.quietStart });
  if (p.quietEnd !== undefined && p.quietEnd !== current.quietEnd)
    writes.push({ key: KEY_OF.quietEnd, value: p.quietEnd });
  if (templates !== undefined && JSON.stringify(templates) !== JSON.stringify(current.templates))
    writes.push({ key: KEY_OF.templates, value: templates });

  const reason = text(form, "reason")?.trim() || null;
  for (const w of writes) {
    if (!(PUSH_SETTING_KEYS as readonly string[]).includes(w.key)) continue;
    const r = await ctx.store.setSetting(w.key, w.value, { reason, ipHash: ctx.ipHash });
    if (!r.ok) return storeFailure(r.error);
  }
  refresh();
  return done(T.done.settingsSaved, { changed: writes.map((w) => w.key) });
}
