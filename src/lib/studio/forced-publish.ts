import "server-only";
import { z } from "zod";
import { REVIEW_BULK_TEXT as T } from "@/content/pt-BR/studio-review";
import { audit } from "@/lib/audit";
import { can, canAccess } from "@/lib/auth/permissions";
import { createServiceClient, type DbClient } from "@/lib/db/client";
import {
  listReviewable,
  QUEUE_TABS,
  QUEUE_ORIGINS,
  REVIEW_SELECTION_MAX,
  type QueueFilter,
} from "@/lib/db/queries/queue";
import { loadRiskRows, type ReviewRiskRow } from "@/lib/db/queries/review-risk";
import { pipelineQueue, type Queue } from "@/lib/pipeline/queue";
import { FORCED_PUBLISH_RUN_ID } from "@/lib/pipeline/types";
import { forcedItemRef, toBatches } from "@/lib/review/batches";
import { summarizeRisks, type RiskEntry, type RiskSummary } from "@/lib/review/bulk-risk";
import type { StudioResult } from "./action";
import { studioContext, type StudioContext } from "./context";

const FilterSchema = z.object({
  tab: z.enum(QUEUE_TABS),
  section: z
    .string()
    .regex(/^[a-z-]{2,40}$/)
    .optional(),
  status: z
    .enum([
      "draft",
      "in_review",
      "changes_requested",
      "approved",
      "scheduled",
      "published",
      "updated",
      "unpublished",
      "archived",
    ])
    .optional(),
  confidence: z.enum(["alta", "média", "baixa"]).optional(),
  assignee: z.string().max(40).optional(),
  origin: z.enum(QUEUE_ORIGINS).optional(),
  due: z.enum(["overdue", "today"]).optional(),
});

/** Seleção: ids marcados (uma página) ou "todas as N" dentro das abas e filtros atuais. */
export const ForcedSelection = z.union([
  z.object({ ids: z.array(z.uuid()).min(1).max(REVIEW_SELECTION_MAX) }),
  z.object({ filter: FilterSchema }),
]);
export type ForcedSelection = z.input<typeof ForcedSelection>;

export type ExcludedReason = "no_body" | "forbidden" | "status" | "unwritten";
export type Excluded = { id: string; title: string; reason: ExcludedReason };

export interface Resolved {
  /** Publicáveis: em revisão, com corpo e dentro do escopo de quem pede. */
  summary: RiskSummary;
  excluded: Excluded[];
}

export interface ForcedDeps {
  ctx?: StudioContext;
  /** Resolve a seleção em matérias com fatos de risco (padrão: banco com a sessão da pessoa). */
  load?: (ctx: StudioContext, selection: ForcedSelection) => Promise<ReviewRiskRow[]>;
  service?: () => DbClient;
  queue?: () => Queue;
}

async function defaultLoad(ctx: StudioContext, sel: ForcedSelection): Promise<ReviewRiskRow[]> {
  const ids =
    "ids" in sel
      ? sel.ids
      : (await listReviewable(sel.filter as QueueFilter)).rows.map((r) => r.id);
  return loadRiskRows(ctx.db, ids);
}

/** Recorte da seleção pelo que a pessoa pode publicar e pelo estado, e o resumo de riscos. */
async function resolve(
  ctx: StudioContext,
  sel: ForcedSelection,
  deps: ForcedDeps,
): Promise<Resolved> {
  const session = ctx.session!;
  const rows = await (deps.load ?? defaultLoad)(ctx, sel);
  const excluded: Excluded[] = [];
  const ok: ReviewRiskRow[] = [];
  for (const r of rows) {
    if (r.status !== "in_review") excluded.push({ id: r.id, title: r.title, reason: "status" });
    // Rascunho montado das fontes (sem redação) nunca vai ao ar, nem "mesmo assim".
    else if (r.unwritten) excluded.push({ id: r.id, title: r.title, reason: "unwritten" });
    else if (
      !can(session.roles, "article.publish", { section: r.sectionSlug, userId: session.userId })
    )
      excluded.push({ id: r.id, title: r.title, reason: "forbidden" });
    else ok.push(r);
  }
  const summary = summarizeRisks(ok);
  for (const e of summary.excluded) excluded.push({ ...e, reason: "no_body" });
  return { summary, excluded };
}

type Failure<O> = Extract<StudioResult<O>, { ok: false }>;
const forbidden = (): Failure<never> => ({ ok: false, error: "forbidden", message: T.forbidden });

function parse(raw: unknown): ForcedSelection | null {
  const p = ForcedSelection.safeParse(raw);
  return p.success ? p.data : null;
}

/** Resumo de riscos da seleção, para o diálogo (nada é gravado). */
export async function previewForcedPublish(
  raw: unknown,
  deps: ForcedDeps = {},
): Promise<StudioResult<Resolved>> {
  const sel = parse(raw);
  if (!sel) return { ok: false, error: "invalid", message: T.loadError };
  const ctx = deps.ctx ?? (await studioContext());
  if (!ctx.session || !canAccess(ctx.session.roles, "article.publish")) return forbidden();
  return { ok: true, value: await resolve(ctx, sel, deps) };
}

const compact = (r: RiskEntry) => ({ key: r.key, count: r.count, example: r.example });

/**
 * Publica a seleção mesmo assim: grava o pedido (quem, quando, quantas, resumo de riscos) como
 * trabalho, decisão `forced_publish` e auditoria, e enfileira lotes de 50 (passo `forced_publish`).
 * Não publica nada na hora. Sem corpo, sem redação (rascunho das fontes), sem permissão na
 * editoria ou fora de revisão: ficam de fora e voltam no resultado.
 */
export async function startForcedPublish(
  raw: unknown,
  deps: ForcedDeps = {},
): Promise<StudioResult<{ jobId: string; total: number; excluded: Excluded[] }>> {
  const sel = parse(raw);
  if (!sel) return { ok: false, error: "invalid", message: T.loadError };
  const ctx = deps.ctx ?? (await studioContext());
  const session = ctx.session;
  if (!session || !canAccess(session.roles, "article.publish")) return forbidden();

  const { summary, excluded } = await resolve(ctx, sel, deps);
  if (summary.total === 0) return { ok: false, error: "invalid", message: T.nothingToPublish };

  const batches = toBatches(summary.publishableIds);
  const risks = { total: summary.total, risks: summary.risks.map(compact) };
  const db = (deps.service ?? createServiceClient)();
  const now = ctx.now().toISOString();
  const { data: job, error } = await db
    .from("forced_publish_jobs")
    .insert({
      requested_by: session.userId,
      requested_at: now,
      total: summary.total,
      batches,
      excluded,
      risks,
    })
    .select("id")
    .single();
  if (error || !job) throw new Error(`publicação forçada: ${error?.message ?? "sem trabalho"}`);

  const ref = `forced_publish:${job.id}`;
  const { error: dErr } = await db.from("decisions").insert({
    object_ref: ref,
    step: "publish",
    input_hash: `forced:${job.id}`,
    output: { action: "forced_publish", total: summary.total, excluded: excluded.length, risks },
    rationale: `Publicação forçada de ${summary.total} matérias da fila de revisão.`,
    human_decision: "forced_publish",
    human_id: session.userId,
  });
  if (dErr) throw new Error(`decisão: ${dErr.message}`);
  await audit(
    session.userId,
    "article.force_publish",
    ref,
    {
      total: summary.total,
      excluded: excluded.length,
      batches: batches.length,
      mode: "ids" in sel ? "ids" : "filter",
      risks: risks.risks,
    },
    ctx.db,
  );

  const queue = (deps.queue ?? pipelineQueue)();
  try {
    for (let i = 0; i < batches.length; i++)
      await queue.enqueue("pipeline", {
        runId: FORCED_PUBLISH_RUN_ID,
        step: "forced_publish",
        itemRef: forcedItemRef(job.id, i),
        attempt: 1,
      });
  } catch (e) {
    // Nada publicado fica sem registro: o trabalho termina com a falha de enfileirar.
    await db
      .from("forced_publish_jobs")
      .update({
        status: "done",
        finished_at: now,
        failed: summary.total,
        failures: [{ id: null, reason: "enqueue" }],
      })
      .eq("id", job.id);
    throw e;
  }
  return { ok: true, value: { jobId: job.id, total: summary.total, excluded } };
}

export interface ForcedStatus {
  status: "queued" | "running" | "done";
  total: number;
  done: number;
  failed: number;
  excluded: { id: string; title: string; reason: string }[];
  failures: { id: string | null; title: string; reason: string }[];
}

/** Andamento do trabalho ("Publicando 120 de 660"); só quem pediu (ou admin) enxerga (RLS). */
export async function forcedPublishStatus(
  jobId: string,
  deps: ForcedDeps = {},
): Promise<StudioResult<ForcedStatus>> {
  if (!z.uuid().safeParse(jobId).success) return { ok: false, error: "invalid" };
  const ctx = deps.ctx ?? (await studioContext());
  if (!ctx.session || !canAccess(ctx.session.roles, "article.publish")) return forbidden();
  const { data, error } = await ctx.db
    .from("forced_publish_jobs")
    .select("status, total, done, failed, excluded, failures")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error(`andamento: ${error.message}`);
  if (!data) return { ok: false, error: "not_found" };
  const failures = (data.failures as { id: string | null; reason: string }[]).slice(0, 100);
  const ids = failures.map((f) => f.id).filter((id): id is string => id !== null);
  const titles = new Map<string, string>();
  if (ids.length > 0) {
    const { data: arts } = await ctx.db.from("articles").select("id, title").in("id", ids);
    for (const a of arts ?? []) titles.set(a.id, a.title);
  }
  return {
    ok: true,
    value: {
      status: data.status as ForcedStatus["status"],
      total: data.total,
      done: data.done,
      failed: data.failed,
      excluded: (data.excluded as ForcedStatus["excluded"]).slice(0, 100),
      failures: failures.map((f) => ({
        id: f.id,
        title: f.id ? (titles.get(f.id) ?? f.id) : "",
        reason: f.reason,
      })),
    },
  };
}
