"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { headers } from "next/headers";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import {
  ANALYZE_ERROR_TEXT,
  BLOCK_REASONS,
  SOURCE_MESSAGES as M,
} from "@/content/pt-BR/sources-admin";
import { approve, reject, requestApproval } from "@/lib/approvals";
import { can } from "@/lib/auth/permissions";
import { audit } from "@/lib/audit";
import {
  configPatch,
  createSourceAdminStore,
  rowToConfig,
  type AuditCtx,
  type BulkItemResult,
  type SourceAdminStore,
  type SourceRow,
  type StoreFail,
} from "@/lib/db/source-admin-store";
import type { Json } from "@/lib/db/types";
import { crawlDelayOf } from "@/lib/db/pipeline-store";
import { checkRobots } from "@/lib/pipeline/http";
import { collectNow } from "@/lib/pipeline/collect-now";
import { productionMediaStore } from "@/lib/pipeline/deps";
import { takedownReproduction } from "@/lib/media/takedown";
import { createMediaRepo } from "@/lib/db/pipeline-store";
import { clientIp, ipKey, rateLimitSalt } from "@/lib/security/rate-limit";
import { requireStudioRole } from "@/lib/studio/guard";
import type { StudioContext } from "@/lib/studio/context";
import {
  analyzeLink,
  type AnalyzeDeps,
  type DiscoveryRecord,
  type LinkAnalysis,
} from "@/lib/sources/analyze";
import { criticalChanges, diffConfig, targetRefFor } from "@/lib/sources/critical";
import {
  idOf,
  isUuid,
  kindOfStrategy,
  parseConfigFields,
  parseSourceExtras,
  textOf,
  versionOf,
  type FieldErrors,
} from "@/lib/sources/form";
import {
  defaultFrequencySchema,
  fastLaneMaxSchema,
  frequencySchema,
  sourceConfigSchema,
} from "@/lib/sources/schema";
import { personKey, sourceDeps, type ResolvedSourceDeps } from "@/lib/sources/server-deps";
import { transition } from "@/lib/sources/status";
import { crawlDelayOf as robotsCrawlDelay } from "@/lib/sources/discover";
import { testConnection, type TestConnectionResult } from "@/lib/sources/test-connection";
import type { SourceAction } from "@/lib/sources/status";
import type { SourceConfig, StatusReason } from "@/lib/sources/types";
import { hostKey, slugFromName } from "@/lib/sources/url";
import { readOnlyNotice } from "@/lib/flags";
import { validateLogo } from "@/lib/sources/logo";

/*
 * Server Actions do painel de fontes (FS-T6). Todas passam por `requireStudioRole("source.manage")`
 * (sem papel: redireciona para entrar) e devolvem `ActionState`. A escrita vai pelas RPCs
 * `source_admin_*` (versão otimista, guard de duas pessoas e auditoria no banco); aqui ficam a
 * validação, os limites por pessoa, as aprovações e a tradução das falhas em texto.
 *
 * Campos dos formulários: ver `src/lib/sources/form.ts`.
 */

const NEXT = "/estudio/control/fontes";

export type ActionState<D = unknown> =
  | { ok: true; message: string; data?: D }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const okState = <D>(message: string, data?: D): ActionState<D> =>
  data === undefined ? { ok: true, message } : { ok: true, message, data };
const failState = (message: string, fieldErrors?: FieldErrors): ActionState<never> =>
  fieldErrors && Object.keys(fieldErrors).length > 0
    ? { ok: false, message, fieldErrors }
    : { ok: false, message };

interface Run {
  ctx: StudioContext;
  userId: string;
  store: SourceAdminStore;
  deps: ResolvedSourceDeps;
}

/** Guarda + dependências; erro inesperado vira mensagem genérica (o redirect da guarda passa). */
async function run<D>(fn: (r: Run) => Promise<ActionState<D>>): Promise<ActionState<D>> {
  const { ctx, session } = await requireStudioRole("source.manage", { next: NEXT });
  const blocked = await readOnlyNotice();
  if (blocked) return failState(blocked);
  try {
    return await fn({
      ctx,
      userId: session.userId,
      store: createSourceAdminStore(ctx.db),
      deps: sourceDeps(),
    });
  } catch (e) {
    console.error("fontes (ação):", e instanceof Error ? e.message : e);
    return failState(M.unexpected);
  }
}

/** Ciclo de vida: rótulo opcional `reason`, lote e hash do IP para a auditoria do trigger. */
async function auditCtx(
  r: Run,
  extra: { reason?: string | null; batchId?: string | null } = {},
): Promise<AuditCtx> {
  let ipHash: string | null = null;
  try {
    const salt = rateLimitSalt();
    if (salt) ipHash = ipKey(clientIp(await headers()), r.deps.now(), salt);
  } catch {
    ipHash = null; // fora de uma requisição (testes)
  }
  return { reason: extra.reason ?? null, batchId: extra.batchId ?? null, ipHash };
}

function refresh(sourceId?: string): void {
  try {
    revalidatePath(NEXT);
    revalidatePath(`${NEXT}/aprovacoes`);
    revalidatePath("/estudio/control/aprovacoes");
    if (sourceId) revalidatePath(`${NEXT}/${sourceId}`);
    // Score, bloqueio e política de imagem mudam o "Veja também" da home (cache de 60 s, tag `home`):
    // um pedido de saída do veículo não pode esperar o cache vencer.
    revalidateTag("home", { expire: 0 });
  } catch {
    /* fora de uma requisição (testes) */
  }
}

/** Limite por pessoa numa janela de 1 h (`rate_limits`); `true` = ainda cabe. */
const withinLimit = (r: Run, bucket: string, limit: number): Promise<boolean> =>
  r.deps.ingest.hitRateLimit(`${bucket}:${personKey(r.userId)}`, limit);

function storeFailState(f: StoreFail): ActionState<never> {
  if (f.error === "fast_lane_full" || f.error === "fast_lane_inactive")
    return failState(f.message, { frequencyMinutes: f.message });
  if (f.error === "duplicate_slug") return failState(f.message, { slug: f.message });
  return failState(f.message);
}

const isFlagOn = async (r: Run, key: string): Promise<boolean> => {
  const { data } = await r.deps.service
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .maybeSingle();
  return data?.enabled === true;
};

// ---------------------------------------------------------------------------
// Análise de link e teste de conexão
// ---------------------------------------------------------------------------

/** Analisa um link (campo `url`): descoberta, prévia, sugestões por regra e IA. 10 por hora por pessoa. */
export async function analyzeLinkAction(form: FormData): Promise<ActionState<LinkAnalysis>> {
  return run(async (r) => {
    if (!(await withinLimit(r, "source_analyze", 10))) return failState(M.rateLimited);
    const deps: AnalyzeDeps = {
      crawl: r.deps.crawl,
      callAgent: r.deps.callAgent,
      linkAnalysisEnabled: () => isFlagOn(r, "source_link_analysis"),
      aiEnabled: () => r.deps.flags.isEnabled("ai_enabled"),
      sections: async () => {
        const { data } = await r.ctx.db.from("sections").select("slug");
        return (data ?? []).map((s) => s.slug);
      },
      findDuplicate: async (key) => {
        const { data, error } = await r.ctx.db
          .from("sources")
          .select("id, name, slug, base_url, feed_url, archived_at")
          .or(
            `base_url.ilike.%${key.replace(/[%_,()\\]/g, "")}%,feed_url.ilike.%${key.replace(/[%_,()\\]/g, "")}%`,
          )
          .limit(20);
        if (error) throw new Error(`fontes: ${error.message}`);
        const same = (data ?? []).filter((s) =>
          [s.base_url, s.feed_url].some((u) => {
            try {
              return u !== null && hostKey(new URL(u)) === key;
            } catch {
              return false;
            }
          }),
        );
        const hit = same.find((s) => s.archived_at === null) ?? same[0];
        return hit
          ? { id: hit.id, name: hit.name, slug: hit.slug, archived: hit.archived_at !== null }
          : null;
      },
      saveDiscovery: async (rec: DiscoveryRecord) => {
        const { data, error } = await r.deps.service
          .from("source_discoveries")
          .insert({
            input_url: rec.inputUrl,
            final_url: rec.finalUrl,
            created_by: r.userId,
            preview: JSON.parse(JSON.stringify(rec.preview)) as NonNullable<Json>,
            suggestion: JSON.parse(JSON.stringify(rec.suggestion)) as NonNullable<Json>,
            prompt_version: rec.promptVersion,
          })
          .select("id")
          .single();
        return error ? null : data.id;
      },
      promptVersion: async () => {
        const { data } = await r.deps.service
          .from("ai_prompts")
          .select("version")
          .eq("agent_id", "source_profiler")
          .eq("status", "production")
          .order("version", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data?.version ?? null;
      },
      now: r.deps.now,
    };
    const result = await analyzeLink(textOf(form, "url") ?? "", deps);
    if (!result.ok)
      return failState(ANALYZE_ERROR_TEXT[result.error], { url: ANALYZE_ERROR_TEXT[result.error] });
    const a = result.value;
    let host = "desconhecido";
    try {
      host = new URL(a.url).hostname;
    } catch {
      /* mantém */
    }
    await audit(r.userId, "source.analyze", `analysis:${host}`.slice(0, 200), {
      host,
      duplicate: a.duplicate !== null,
      strategy: a.discovery?.strategy ?? null,
      aiStatus: a.aiStatus,
    });
    return okState(a.duplicate ? M.analyze.duplicate : M.analyze.ok, a);
  });
}

/**
 * Testa a conexão com o endereço de coleta. Com `id`, usa a fonte cadastrada; sem ele, os campos
 * `feedUrl` ou `baseUrl` e `kind` (assistente de nova fonte). 30 por hora por pessoa, mais 30 por
 * hora por site.
 */
export async function testConnectionAction(
  form: FormData,
): Promise<ActionState<TestConnectionResult>> {
  return run(async (r) => {
    if (!(await withinLimit(r, "source_test", 30))) return failState(M.rateLimited);
    const id = idOf(form);
    let src: Parameters<typeof testConnection>[0];
    let ref = "source:novo";
    if (id) {
      const row = await r.store.load(id);
      if (!row) return failState(M.notFound);
      src = {
        kind: row.kind,
        feedUrl: row.feed_url,
        baseUrl: row.base_url,
        consumption: consumptionOf(row),
      };
      ref = `source:${id}`;
    } else {
      const x = parseSourceExtras(form);
      if (Object.keys(x.fieldErrors).length > 0 || !(x.feedUrl ?? x.baseUrl))
        return failState(M.invalid, x.fieldErrors);
      src = {
        kind: x.kind ?? "rss",
        feedUrl: x.feedUrl ?? null,
        baseUrl: x.baseUrl ?? x.feedUrl ?? "",
        ...(x.consumption ? { consumption: x.consumption } : {}),
      };
    }
    const result = await testConnection(src, { ...r.deps.crawl, now: () => Date.now() });
    await audit(r.userId, "source.test_connection", ref, {
      ok: result.ok,
      status: result.status,
      items: result.items,
    });
    return result.ok
      ? okState(M.connection(result.items), result)
      : { ok: false, message: result.message };
  });
}

function consumptionOf(row: SourceRow): Record<string, unknown> {
  const c = row.consumption;
  return typeof c === "object" && c !== null && !Array.isArray(c)
    ? (c as Record<string, unknown>)
    : {};
}

// ---------------------------------------------------------------------------
// Criar e atualizar
// ---------------------------------------------------------------------------

/** Pede a segunda aprovação de cada mudança crítica. Devolve quantos pedidos nasceram e os que falharam. */
async function requestCritical(
  sourceId: string,
  changes: ReturnType<typeof criticalChanges>,
  justification: string,
): Promise<{ requested: number; failed: string[] }> {
  let requested = 0;
  const failed: string[] = [];
  for (const change of changes) {
    const r = await requestApproval({
      kind: "source.critical",
      targetRef: targetRefFor(sourceId, change),
      justification,
    });
    if (r.ok) requested++;
    else failed.push(String(change.field));
  }
  return { requested, failed };
}

/**
 * Cria a fonte (sempre `paused`, aguardando ativação). Campos que ampliam direitos (imagem, republicação,
 * confiabilidade alta, fonte única) nascem no valor restrito e viram pedidos de segunda aprovação, com
 * `justification`. Frequência da via rápida só vale depois de ativar.
 */
export async function createSourceAction(
  form: FormData,
): Promise<ActionState<{ id: string; slug: string; approvals: number }>> {
  return run(async (r) => {
    const parsed = parseConfigFields(form);
    const extras = parseSourceExtras(form);
    const fieldErrors: FieldErrors = { ...parsed.fieldErrors, ...extras.fieldErrors };

    const desired: SourceConfig = {
      name: "",
      displayName: null,
      ownerId: null,
      layer: null,
      categories: [],
      locality: "mt",
      reliability: "standard",
      imagePolicy: "none",
      republishPolicy: "link_only",
      maySoleSource: false,
      agreementUntil: null,
      agreementNote: null,
      termsUrl: null,
      termsMinIntervalMinutes: null,
      frequencyMinutes: null,
      rateLimitPerHour: 60,
      editorialScore: 3,
      priority: 2,
      ...parsed.patch,
    };
    if (!form.has("locality")) fieldErrors.locality ??= "Escolha a localidade.";
    const whole = sourceConfigSchema.safeParse(desired);
    if (!whole.success)
      for (const i of whole.error.issues) fieldErrors[String(i.path[0] ?? "form")] ??= i.message;
    const slug = (textOf(form, "slug") ?? slugFromName(desired.name)).trim();
    if (!/^[a-z0-9][a-z0-9-]{1,59}$/.test(slug))
      fieldErrors.slug = "Use letras minúsculas, números e hífen (2 a 60 caracteres).";
    if (!extras.baseUrl) fieldErrors.baseUrl ??= "Informe o endereço do site.";

    const baseline: SourceConfig = {
      ...desired,
      reliability: desired.reliability === "low" ? "low" : "standard",
      imagePolicy: "none",
      republishPolicy: "link_only",
      maySoleSource: false,
    };
    const critical = criticalChanges(baseline, desired);
    const justification = (textOf(form, "justification") ?? "").trim();
    if (critical.length > 0 && !justification) fieldErrors.justification = M.justificationRequired;
    if (Object.keys(fieldErrors).length > 0) return failState(M.invalid, fieldErrors);

    const deferredFrequency = desired.frequencyMinutes !== null && desired.frequencyMinutes < 30;
    const consumption = extras.consumption;
    const patch = configPatch({
      ...baseline,
      frequencyMinutes: deferredFrequency ? null : desired.frequencyMinutes,
    });
    const created = await r.store.create(
      {
        slug,
        base_url: extras.baseUrl as string,
        kind: extras.kind ?? (consumption ? kindOfStrategy(consumption.strategy) : "rss"),
        feed_url: extras.feedUrl ?? null,
        ...(consumption
          ? {
              consumption: {
                ...consumption,
                discovery: consumption.discovery ?? {
                  at: r.deps.now().toISOString(),
                  by: textOf(form, "discoveryId") ? "auto" : "human",
                  inputUrl: extras.baseUrl as string,
                  tried: 0,
                },
              },
            }
          : {}),
        ...patch,
      },
      await auditCtx(r, { reason: "Cadastro da fonte" }),
    );
    if (!created.ok) return storeFailState(created);
    const id = created.value.id;

    const discoveryId = textOf(form, "discoveryId");
    if (discoveryId && /^[0-9a-f-]{36}$/i.test(discoveryId)) {
      await r.deps.service
        .from("source_discoveries")
        .update({
          source_id: id,
          accepted_fields: form
            .getAll("acceptedFields")
            .filter((v): v is string => typeof v === "string")
            .slice(0, 30),
        })
        .eq("id", discoveryId)
        .eq("created_by", r.userId);
    }

    let approvals = 0;
    let note = "";
    if (critical.length > 0) {
      const req = await requestCritical(id, critical, justification);
      approvals = req.requested;
      if (approvals > 0) note += ` ${M.approvalPending(approvals)}.`;
    }
    if (deferredFrequency)
      note += " A via rápida só vale para fonte ativa: escolha a frequência depois de ativar.";
    refresh(id);
    return okState(`${M.created}${note}`, { id, slug, approvals });
  });
}

/**
 * Atualiza a configuração da fonte (só os campos que vieram no formulário), com `id` e `version`.
 * Mudança que amplia direitos não é aplicada: vira pedido de segunda aprovação e exige `justification`.
 * O resto aplica na hora, com versão otimista.
 */
export async function updateSourceAction(
  form: FormData,
): Promise<ActionState<{ version: number; approvals: number }>> {
  return run(async (r) => {
    const id = idOf(form);
    const version = versionOf(form);
    if (!id || version === null) return failState(M.invalid);
    const row = await r.store.load(id);
    if (!row) return failState(M.notFound);
    if (row.archived_at) return failState(M.archived);
    if (row.version !== version) return conflict(r, row, id);

    const parsed = parseConfigFields(form);
    const extras = parseSourceExtras(form);
    const fieldErrors: FieldErrors = { ...parsed.fieldErrors, ...extras.fieldErrors };
    const before = rowToConfig(row);
    const after: SourceConfig = { ...before, ...parsed.patch };
    const critical = criticalChanges(before, after);
    const justification = (textOf(form, "justification") ?? "").trim();
    if (critical.length > 0 && !justification) fieldErrors.justification = M.justificationRequired;
    if (Object.keys(fieldErrors).length > 0) return failState(M.invalid, fieldErrors);

    const criticalFields = new Set(critical.map((c) => c.field));
    const plain: Partial<SourceConfig> = {};
    for (const c of diffConfig(before, after))
      if (!criticalFields.has(c.field)) (plain as Record<string, unknown>)[c.field] = c.to;
    const patch: { [column: string]: Json } = configPatch(plain);
    if (extras.baseUrl !== undefined && extras.baseUrl !== row.base_url)
      patch.base_url = extras.baseUrl;
    if (extras.feedUrl !== undefined && extras.feedUrl !== row.feed_url)
      patch.feed_url = extras.feedUrl;
    if (extras.kind !== undefined && extras.kind !== row.kind) patch.kind = extras.kind;
    if (extras.consumption !== undefined) patch.consumption = extras.consumption;
    if (extras.termsReviewed === true && !row.terms_reviewed_at) {
      patch.terms_reviewed_at = r.deps.now().toISOString();
      patch.terms_reviewed_by = r.userId;
    } else if (extras.termsReviewed === false && row.terms_reviewed_at) {
      patch.terms_reviewed_at = null;
      patch.terms_reviewed_by = null;
    }

    let newVersion = row.version;
    const applied = Object.keys(patch).length > 0;
    if (applied) {
      const res = await r.store.update(
        id,
        version,
        patch,
        await auditCtx(r, { reason: justification || null }),
      );
      if (!res.ok) return res.error === "conflict" ? failState(res.message) : storeFailState(res);
      newVersion = res.value.version;
    }

    let requested = 0;
    if (critical.length > 0) {
      const req = await requestCritical(id, critical, justification);
      requested = req.requested;
      if (requested === 0 && !applied)
        return failState(
          "Já existe um pedido pendente igual ou o pedido é inválido. Confira as aprovações pendentes.",
        );
    }
    if (!applied && requested === 0)
      return okState(M.noChanges, { version: newVersion, approvals: 0 });
    refresh(id);
    return okState(
      requested > 0
        ? applied
          ? M.savedWithApproval(requested)
          : M.approvalPending(requested)
        : M.saved,
      { version: newVersion, approvals: requested },
    );
  });
}

/** Versão do formulário desatualizada: "alterada por <pessoa> às <hora>" (do histórico de auditoria). */
async function conflict(r: Run, _row: SourceRow, id: string): Promise<ActionState<never>> {
  return failState((await r.store.conflict(id)).message);
}

// ---------------------------------------------------------------------------
// Estado: ativar, pausar, bloquear, desbloquear, arquivar, restaurar
// ---------------------------------------------------------------------------

type Activation = ActionState<{ version: number }>;
type StatusData = { version?: number; removedImages?: number; approvals?: number };

/** Ativação: termos revisados, robots permitindo e teste de conexão ok (nessa ordem). */
async function activate(r: Run, id: string, version: number): Promise<Activation> {
  const row = await r.store.load(id);
  if (!row) return failState(M.notFound);
  if (row.archived_at) return failState(M.archived);
  if (row.status !== "paused") return failState(M.invalidTransition);
  if (row.version !== version) return conflict(r, row, id);
  if (!row.terms_reviewed_at) return failState(M.activationBlocked.termsNotReviewed);
  const cons = consumptionOf(row);
  if (
    (row.kind !== "page" && !row.feed_url) ||
    (row.kind === "page" && Object.keys(cons).length === 0)
  )
    return failState(M.activationBlocked.noAddress);

  const target = row.feed_url ?? row.base_url;
  const host = new URL(target).hostname.toLowerCase();
  const robots = await checkRobots(r.deps.crawl, target, {
    bucket: `activate:${host}`,
    limitPerHour: 30,
  });
  if (robots.kind === "disallowed") return failState(M.activationBlocked.robots);
  if (robots.kind === "rate_limited") return failState(M.rateLimited);
  if (robots.kind === "unavailable")
    return failState(M.activationBlocked.connection("não foi possível ler o robots.txt"));

  if (!(await withinLimit(r, "source_test", 30))) return failState(M.rateLimited);
  const test = await testConnection(
    { kind: row.kind, feedUrl: row.feed_url, baseUrl: row.base_url, consumption: cons },
    { ...r.deps.crawl, now: () => Date.now() },
  );
  if (!test.ok) return failState(M.activationBlocked.connection(test.message));

  // O Crawl-delay lido agora passa a valer na frequência efetiva.
  const crawlDelaySec =
    robotsCrawlDelay(robots.robotsTxt, r.deps.crawl.userAgent) ?? crawlDelayOf(row.consumption);
  const withRobots = {
    ...cons,
    robots: {
      checkedAt: r.deps.now().toISOString(),
      allowed: true,
      crawlDelaySec: crawlDelaySec ?? null,
    },
  } as { [key: string]: Json };
  const upd = await r.store.update(
    id,
    version,
    { consumption: withRobots },
    await auditCtx(r, { reason: "Robots.txt conferido na ativação" }),
  );
  if (!upd.ok) return storeFailState(upd);
  const res = await r.store.setStatus(id, upd.value.version, "activate", null, await auditCtx(r));
  if (!res.ok) return storeFailState(res);
  refresh(id);
  return okState(M.statusDone.activate, { version: res.value.version });
}

/** Ativa a fonte (`id`, `version`): termos revisados, robots permitindo e teste de conexão ok. */
export async function activateSourceAction(form: FormData): Promise<Activation> {
  return run(async (r) => {
    const id = idOf(form);
    const version = versionOf(form);
    if (!id || version === null) return failState(M.invalid);
    return activate(r, id, version);
  });
}

const STATUS_ACTIONS = [
  "activate",
  "resume",
  "pause",
  "block",
  "unblock",
  "archive",
  "restore",
] as const;
type StatusActionName = (typeof STATUS_ACTIONS)[number];

/**
 * Ações de estado (`action`): activate/resume, pause, block (`reason` = código), unblock (pede segunda
 * aprovação, com `justification`), archive (`reason` em texto: "excluir" = arquivar, itens e matérias
 * ficam) e restore. Bloqueio por `opt_out` zera a política de imagem e remove as reproduções.
 */
export async function sourceStatusAction(form: FormData): Promise<ActionState<StatusData>> {
  return run<StatusData>(async (r) => {
    const id = idOf(form);
    const version = versionOf(form);
    const name = textOf(form, "action") as StatusActionName | undefined;
    if (!id || version === null || !name || !STATUS_ACTIONS.includes(name))
      return failState(M.invalid);
    if (name === "activate" || name === "resume") return activate(r, id, version);

    const row = await r.store.load(id);
    if (!row) return failState(M.notFound);
    if (row.version !== version) return conflict(r, row, id);
    const reason = (textOf(form, "reason") ?? "").trim();

    // Validação de estado pelo domínio (a mesma regra é imposta no banco).
    const state = {
      status: row.status,
      statusReason: (row.status_reason ?? null) as StatusReason | null,
      consecutiveFailures: row.consecutive_failures,
      archivedAt: row.archived_at,
    };
    const domain: SourceAction =
      name === "block"
        ? { type: "block", reason: reason || "", code: reason as StatusReason }
        : name === "archive"
          ? { type: "archive", reason }
          : ({ type: name } as SourceAction);
    const t = transition(state, domain, r.deps.now());
    if (!t.ok) {
      const text = {
        invalid_transition: M.invalidTransition,
        must_pause_first: M.mustPauseFirst,
        reason_required: M.reasonRequired,
        archived: M.archived,
      }[t.error];
      return failState(text, t.error === "reason_required" ? { reason: text } : undefined);
    }

    if (name === "unblock") {
      const justification = (textOf(form, "justification") ?? "").trim();
      if (!justification)
        return failState(M.justificationRequired, { justification: M.justificationRequired });
      const req = await requestApproval({
        kind: "source.critical",
        targetRef: `source:${id}:status=paused`,
        justification,
      });
      if (!req.ok) return failState(req.message);
      refresh(id);
      return okState(M.approvalPending(1), { approvals: 1 });
    }

    if (name === "block" && !(BLOCK_REASONS as readonly string[]).includes(reason))
      return failState(M.reasonRequired, { reason: M.reasonRequired });

    const res = await r.store.setStatus(
      id,
      version,
      name,
      name === "pause" ? "manual" : reason || null,
      await auditCtx(r, { reason: reason || null }),
    );
    if (!res.ok) return storeFailState(res);

    let removed = 0;
    if (name === "block" && reason === "opt_out") {
      const service = r.deps.service;
      const take = await takedownReproduction(
        {
          repo: createMediaRepo(service),
          store: r.deps.mediaStore ?? r.ctx.mediaStore ?? productionMediaStore(service),
          revalidate: r.ctx.revalidate,
          now: r.deps.now,
        },
        { sourceId: id },
        r.userId,
        "Pedido de remoção pela fonte (opt-out)",
      );
      if (take.ok) removed = take.value.blocked;
    }
    refresh(id);
    const message =
      name === "block" && reason === "opt_out"
        ? M.optOutDone(removed)
        : M.statusDone[name as keyof typeof M.statusDone];
    return okState(message, { version: res.value.version, removedImages: removed });
  });
}

// ---------------------------------------------------------------------------
// Coletar agora e lote
// ---------------------------------------------------------------------------

/** "Coletar agora" (`id`): 1 por fonte a cada 5 min e 20 por hora por pessoa. */
export async function collectNowAction(form: FormData): Promise<ActionState<{ runId: string }>> {
  return run(async (r) => {
    const id = idOf(form);
    if (!id) return failState(M.invalid);
    const res = await collectNow(id, {
      runs: r.deps.runs,
      queue: r.deps.queue,
      repo: r.deps.ingest,
      now: r.deps.now,
      actor: r.userId,
    });
    if (!res.ok)
      return failState(
        res.error === "rate_limited"
          ? M.collectNow.rateLimited
          : res.error === "not_active"
            ? M.collectNow.notActive
            : M.collectNow.notFound,
      );
    await audit(r.userId, "source.collect_now", `source:${id}`, { runId: res.value.runId });
    refresh(id);
    return okState(M.collectNow.started, { runId: res.value.runId });
  });
}

/**
 * Lote de até 50 fontes: `ids` (repetido ou separado por vírgula), `action` (`pause`, `activate` ou
 * `frequency` com `frequencyMinutes`). Cada fonte tem resultado próprio; todas levam o mesmo `batchId` na
 * auditoria. `activate` em lote só vale para fonte que já foi ativada antes: a primeira ativação exige o
 * teste de conexão, individual.
 */
export async function bulkSourcesAction(
  form: FormData,
): Promise<
  ActionState<{ batchId: string; applied: number; skipped: number; items: BulkItemResult[] }>
> {
  return run(async (r) => {
    const ids = [
      ...new Set(
        form
          .getAll("ids")
          .filter((v): v is string => typeof v === "string")
          .flatMap((v) => v.split(","))
          .map((v) => v.trim())
          .filter(Boolean),
      ),
    ];
    if (ids.length < 1 || ids.length > 50 || ids.some((i) => !isUuid(i)))
      return failState(M.bulk.tooMany);
    const action = textOf(form, "action");
    if (action !== "pause" && action !== "activate" && action !== "frequency")
      return failState(M.invalid);

    let value: { frequency_minutes: number | null } | undefined;
    if (action === "frequency") {
      const raw = textOf(form, "frequencyMinutes") ?? "";
      const n = raw.trim() === "" || raw === "default" ? null : Number(raw);
      const check = frequencySchema.safeParse(n);
      if (!check.success)
        return failState(M.invalid, {
          frequencyMinutes: check.error.issues[0]?.message ?? M.invalid,
        });
      value = { frequency_minutes: n };
    }

    // Primeira ativação não passa pelo lote (falta o teste de conexão).
    let toRun = ids;
    const skippedFirst: BulkItemResult[] = [];
    if (action === "activate") {
      const { data } = await r.ctx.db
        .from("sources")
        .select("id, slug, status_reason")
        .in("id", ids);
      const first = new Set(
        (data ?? []).filter((s) => s.status_reason === "pending_activation").map((s) => s.id),
      );
      toRun = ids.filter((i) => !first.has(i));
      for (const s of data ?? [])
        if (first.has(s.id))
          skippedFirst.push({
            id: s.id,
            slug: s.slug,
            outcome: "ignored",
            reason: "needs_first_activation",
            message: M.bulk.reason.needs_first_activation ?? null,
          });
    }

    const batchId = randomUUID();
    let items: BulkItemResult[] = [];
    if (toRun.length > 0) {
      const res = await r.store.bulk(
        toRun,
        action,
        value,
        await auditCtx(r, { reason: "Ação em lote", batchId }),
      );
      if (!res.ok) return storeFailState(res);
      items = res.value;
    }
    items = [...items, ...skippedFirst];
    const applied = items.filter((i) => i.outcome === "applied").length;
    const skipped = items.length - applied;
    refresh();
    return okState(M.bulk.done(applied, skipped), { batchId, applied, skipped, items });
  });
}

// ---------------------------------------------------------------------------
// Aprovação de mudança crítica
// ---------------------------------------------------------------------------

/**
 * Decide um pedido `source.critical` (`id`, `decision` = `approve` ou `reject`). Exige
 * `source.approve_critical` (administração e editor-chefe) e pessoa diferente de quem pediu; as duas
 * condições são impostas no banco. Aprovar aplica a mudança na fonte na mesma transação.
 */
export async function decideApprovalAction(
  form: FormData,
): Promise<ActionState<{ decision: string }>> {
  return run(async (r) => {
    const id = idOf(form);
    const decision = textOf(form, "decision");
    if (!id || (decision !== "approve" && decision !== "reject")) return failState(M.invalid);
    const { data, error } = await r.ctx.db
      .from("approvals")
      .select("kind, requested_by")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data || data.kind !== "source.critical") return failState(M.approval.notCritical);
    // Quem pediu sempre recebe "outra pessoa" (com o registro do banco); os demais precisam do papel.
    const session = r.ctx.session;
    if (data.requested_by !== r.userId && session && !can(session.roles, "source.approve_critical"))
      return failState(M.approval.forbidden);

    const res = decision === "approve" ? await approve({ id }) : await reject({ id });
    if (!res.ok) {
      const text =
        res.error === "forbidden"
          ? M.approval.forbidden
          : (APPROVAL_ERROR_TEXT[res.error] ?? res.message);
      return failState(text);
    }
    refresh();
    return okState(decision === "approve" ? M.approval.approved : M.approval.rejected, {
      decision,
    });
  });
}

// ---------------------------------------------------------------------------
// Padrões globais e logo
// ---------------------------------------------------------------------------

/** Frequência padrão global (`minutes`): só o ciclo normal, 30 a 1440 em múltiplos de 30. */
export async function setDefaultFrequencyAction(
  form: FormData,
): Promise<ActionState<{ minutes: number }>> {
  return run(async (r) => {
    const raw = Number(textOf(form, "minutes") ?? textOf(form, "defaultFrequencyMinutes") ?? "");
    const check = defaultFrequencySchema.safeParse(raw);
    if (!check.success)
      return failState(M.defaultFrequency.invalid, { minutes: M.defaultFrequency.invalid });
    const res = await r.store.setDefaultFrequency(check.data, await auditCtx(r));
    if (!res.ok) return storeFailState(res);
    refresh();
    return okState(M.defaultFrequency.saved(check.data), { minutes: check.data });
  });
}

/** Vagas da via rápida (`max`, 0 a 20). */
export async function setFastLaneMaxAction(form: FormData): Promise<ActionState<{ max: number }>> {
  return run(async (r) => {
    const raw = Number(textOf(form, "max") ?? textOf(form, "fastLaneMax") ?? "");
    const check = fastLaneMaxSchema.safeParse(raw);
    if (!check.success) return failState(M.fastLaneMax.invalid, { max: M.fastLaneMax.invalid });
    const res = await r.store.setFastLaneMax(check.data, await auditCtx(r));
    if (!res.ok) return storeFailState(res);
    const lane = await r.store.fastLane();
    refresh();
    return okState(
      lane.used > check.data
        ? `${M.fastLaneMax.saved(check.data)} ${M.fastLaneMax.belowUsed(lane.used)}`
        : M.fastLaneMax.saved(check.data),
      { max: check.data },
    );
  });
}

/** Logo da fonte (`id`, `version`, `file`): PNG ou WebP quadrado, de 96 px a 200 KB; SVG é recusado. */
export async function uploadLogoAction(
  form: FormData,
): Promise<ActionState<{ path: string; version: number }>> {
  return run(async (r) => {
    const id = idOf(form);
    const version = versionOf(form);
    const file = form.get("file");
    if (!id || version === null) return failState(M.invalid);
    if (!(file instanceof File) || file.size === 0)
      return failState(M.logo.missing, { file: M.logo.missing });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const check = validateLogo(bytes, file.type);
    if (!check.ok) {
      const text =
        M.logo[
          check.error === "type"
            ? "type"
            : check.error === "size"
              ? "size"
              : check.error === "square"
                ? "square"
                : check.error === "small"
                  ? "small"
                  : "unreadable"
        ];
      return failState(text, { file: text });
    }
    const row = await r.store.load(id);
    if (!row) return failState(M.notFound);
    if (row.archived_at) return failState(M.archived);
    if (row.version !== version) return conflict(r, row, id);
    const up = await r.store.uploadLogo(id, {
      bytes,
      contentType: check.value.format === "png" ? "image/png" : "image/webp",
    });
    if (!up.ok) return storeFailState(up);
    const res = await r.store.update(
      id,
      version,
      { logo_path: up.value.path },
      await auditCtx(r, { reason: "Logo enviado" }),
    );
    if (!res.ok) return storeFailState(res);
    refresh(id);
    return okState(M.logo.saved, { path: up.value.path, version: res.value.version });
  });
}
