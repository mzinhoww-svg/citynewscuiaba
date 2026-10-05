import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { APPROVAL_ERROR_TEXT } from "@/content/pt-BR/approvals";
import { AB_TEXT, REC_TEXT, WHY_TEXT } from "@/content/pt-BR/recommendation-admin";
import { createApprovals, supabaseApprovalsPort, type CriticalKind } from "@/lib/approvals";
import { APPROVER_ACTION, recTarget } from "@/lib/approvals/targets";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import type { Json } from "@/lib/db/types";
import { experimentById, weightsHistory } from "@/lib/db/queries/recommendation";
import { getSourceSignals } from "@/lib/db/queries/sources";
import { explainRecommendation, rankSources } from "@/lib/ranking";
import { weightsValid } from "@/lib/ranking/experiments";
import { scoreBreakdown, type ScoreBreakdown } from "@/lib/ranking/metrics";
import { REC_V1, WEIGHT_KEYS } from "@/lib/ranking/score";
import type { Weights } from "@/lib/ranking/types";
import { StudioFailure, studioAction, type ActionContext } from "./action";
import { evaluateGovernance } from "@/lib/governance";
import { requestAndApproveCommand } from "./approvals";

/*
 * Recomendação (P5-T7): propor pesos (versão nova + pedido `rec.weights`), ativar pesos
 * aprovados (`rec_weights_activate`, 0037), campanhas, testes A/B e "Por que esta
 * recomendação". Papel: `rec.weights` (admin, operador_ia), o mesmo da RLS. A-128: quem propõe
 * e pode aprovar ativa na mesma ação; o pedido e a auditoria guardam quem propôs e quem aprovou.
 */

const noScope = () => ({});
const weight = z.number().min(0).max(1);
const WeightsInput = z.object({
  popularity: weight,
  individual: weight,
  recency: weight,
  engagement: weight,
  operational: weight,
  diversity: weight,
});

const sameWeights = (a: Weights, b: Weights) =>
  WEIGHT_KEYS.every((k) => Math.abs(a[k] - b[k]) < 0.0005);

/** Próximo nome de versão `rec-v<n>` livre. */
function nextVersion(existing: string[]): string {
  const max = existing.reduce((m, v) => {
    const n = /^rec-v(\d+)$/.exec(v);
    return n ? Math.max(m, Number(n[1])) : m;
  }, 0);
  return `rec-v${max + 1}`;
}

async function insertWeights(
  ctx: { db: Parameters<typeof weightsHistory>[0]; userId: string },
  weights: Weights,
  base: { cap: number; discoveryEvery: number },
): Promise<string> {
  const history = await weightsHistory(ctx.db);
  let version = nextVersion(history.map((h) => h.version));
  for (let attempt = 0; attempt < 3; attempt++) {
    const { error } = await ctx.db.from("rec_weights").insert({
      version,
      weights: { ...weights } as NonNullable<Json>,
      cap: base.cap,
      discovery_every: base.discoveryEvery,
      proposed_by: ctx.userId,
    });
    if (!error) return version;
    if (error.code === "23505") version = `${version}-${attempt + 1}`;
    else if (error.code === "42501") throw new StudioFailure("forbidden", AB_TEXT.forbidden);
    else throw new Error(`rec_weights insert: ${error.message}`);
  }
  throw new StudioFailure("conflict", AB_TEXT.genericError);
}

// ---------------------------------------------------------------------------
// Pesos
// ---------------------------------------------------------------------------
const ProposeInput = z.object({
  weights: WeightsInput,
  justification: z.string().trim().min(1, REC_TEXT.justificationRequired).max(2000),
});
export type ProposeWeightsInput = z.infer<typeof ProposeInput>;

export interface ProposeWeightsOutcome {
  version: string;
  approvalId: string | null;
  /** `applied`: os pesos já estão ativos; `pending`: aguardam quem tem o papel de aprovar. */
  status: "applied" | "pending";
}

/**
 * Pedido `rec.weights` da versão nova; se quem propõe pode aprovar, aprova e ativa na mesma ação
 * (A-128). Devolve se ficou ativo ou pendente.
 */
async function requestAndActivate(
  ctx: ActionContext,
  version: string,
  justification: string,
  details: Record<string, unknown>,
  weights: { next: Weights; current: Weights | null },
): Promise<{ approvalId: string; status: "applied" | "pending" }> {
  // Validar → simular → ativar → auditar (A-160): mudança brusca ou soma errada é recusada e os
  // pesos em vigor continuam; segura, o sistema ativa na hora.
  const policy = evaluateGovernance({
    kind: "rec.weights",
    actorRoles: ctx.session?.roles.map((r) => r.role) ?? [],
    current: weights.current,
    next: weights.next,
  });
  const approval = await requestAndApproveCommand({
    kind: "rec.weights",
    targetRef: recTarget(version),
    justification,
    details,
    policy,
  });
  if (!approval.ok) throw new StudioFailure(approval.error, approval.message);
  const approvalId = approval.value.id;
  if (approval.value.status === "pending") return { approvalId, status: "pending" };
  await activateApproved(ctx, approvalId);
  return { approvalId, status: "applied" };
}

/** Nova versão de pesos (inativa, em nome de quem propõe) + pedido `rec.weights`. */
export const proposeWeightsCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: ProposeWeightsInput, ctx): Promise<ProposeWeightsOutcome> => {
    const valid = weightsValid(i.weights);
    if (!valid.ok) throw new StudioFailure("invalid", REC_TEXT.sumBad);
    const history = await weightsHistory(ctx.db);
    const active = history.find((h) => h.active);
    if (active?.weights && sameWeights(active.weights, i.weights))
      throw new StudioFailure("invalid", REC_TEXT.noChanges);
    const version = await insertWeights(ctx, i.weights, {
      cap: active?.cap ?? 0.25,
      discoveryEvery: active?.discoveryEvery ?? 5,
    });
    ctx.setObjectRef(recTarget(version));
    ctx.detail({ version, weights: i.weights, justification: i.justification });
    const { approvalId, status } = await requestAndActivate(
      ctx,
      version,
      i.justification,
      { version, weights: i.weights },
      { next: i.weights, current: active?.weights ?? null },
    );
    ctx.detail({ approvalId, status });
    return { version, approvalId, status };
  },
  { schema: ProposeInput, auditAs: "rec.weights", objectRef: () => "rec:" },
);

const ActivateInput = z.object({ approvalId: z.uuid() });
export type ActivateWeightsInput = z.infer<typeof ActivateInput>;

/**
 * Ativa a versão aprovada (só quem aprovou aplica); pendente + papel → aprova e ativa. Quem
 * pediu pode ser quem aprova (A-128).
 */
async function activateApproved(
  ctx: ActionContext,
  approvalId: string,
): Promise<{ version: string; previous: string | null; targetRef: string }> {
  const port = supabaseApprovalsPort(ctx.db);
  const row = await port.get(approvalId);
  if (!row || row.kind !== "rec.weights") throw new StudioFailure("not_found");
  if (row.status === "pending") {
    const action = APPROVER_ACTION[row.kind as CriticalKind];
    if (!ctx.session || !canAccess(ctx.session.roles, action))
      throw new StudioFailure("forbidden", APPROVAL_ERROR_TEXT.forbidden);
    const r = await createApprovals(ctx.db).approve({ id: approvalId });
    if (!r.ok)
      throw new StudioFailure(
        r.error === "forbidden" ? "forbidden" : "conflict",
        APPROVAL_ERROR_TEXT[r.error],
      );
    await audit(
      ctx.userId,
      "approval.approved",
      row.targetRef,
      { approvalId, kind: row.kind, requestedBy: row.requestedBy },
      ctx.db,
    );
  } else if (row.status !== "approved") {
    throw new StudioFailure("conflict", APPROVAL_ERROR_TEXT.not_pending);
  }
  const { data, error } = await ctx.db.rpc("rec_weights_activate", { p_approval: approvalId });
  if (error) {
    if (error.code === "42501" || /quem aprovou/.test(error.message))
      throw new StudioFailure("forbidden", REC_TEXT.activateForbidden);
    if (error.code === "P0002") throw new StudioFailure("not_found");
    throw new Error(`rec_weights_activate: ${error.message}`);
  }
  const out = data as { applied?: boolean; version?: string; previous?: string | null } | null;
  if (!out?.applied) throw new StudioFailure("conflict", APPROVAL_ERROR_TEXT.not_pending);
  await audit(
    ctx.userId,
    "approval.applied",
    row.targetRef,
    { approvalId, kind: row.kind, requestedBy: row.requestedBy },
    ctx.db,
  );
  return {
    version: String(out.version),
    previous: out.previous ?? null,
    targetRef: row.targetRef,
  };
}

export const activateWeightsCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: ActivateWeightsInput, ctx): Promise<{ version: string; previous: string | null }> => {
    const { version, previous, targetRef } = await activateApproved(ctx, i.approvalId);
    ctx.setObjectRef(targetRef);
    ctx.detail({ approvalId: i.approvalId, version, previous });
    return { version, previous };
  },
  { schema: ActivateInput, auditAs: "rec.weights.activate", objectRef: () => "rec:" },
);

// ---------------------------------------------------------------------------
// Campanhas
// ---------------------------------------------------------------------------
const CampaignInput = z.object({
  name: z.string().trim().min(1).max(120),
  sourceIds: z.array(z.uuid()).min(1, REC_TEXT.campaignSourcesRequired).max(20),
  startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  quota: z.number().int().min(1).max(3),
  audience: z.enum(["all", "local", "anonymous", "accounts"]),
});
export type CampaignInput = z.infer<typeof CampaignInput>;

export const createCampaignCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: CampaignInput, ctx): Promise<{ id: string }> => {
    if (i.endsOn < i.startsOn) throw new StudioFailure("invalid", REC_TEXT.campaignPeriodInvalid);
    const { data, error } = await ctx.db
      .from("rec_campaigns")
      .insert({
        name: i.name,
        source_ids: i.sourceIds,
        starts_on: i.startsOn,
        ends_on: i.endsOn,
        quota: i.quota,
        audience: i.audience,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "42501") throw new StudioFailure("forbidden", AB_TEXT.forbidden);
      throw new Error(`rec_campaigns insert: ${error?.message ?? "sem retorno"}`);
    }
    ctx.setObjectRef(`rec_campaign:${data.id}`);
    ctx.detail({ ...i });
    return { id: data.id };
  },
  { schema: CampaignInput, auditAs: "rec.campaign.create", objectRef: () => "rec_campaign:" },
);

// ---------------------------------------------------------------------------
// Testes A/B
// ---------------------------------------------------------------------------
const ExperimentInput = z.object({
  name: z.string().trim().min(1).max(120),
  variants: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        weightsVersion: z.string().min(1).max(60),
      }),
    )
    .min(2)
    .max(4),
  split: z.array(z.number().int().min(1).max(99)).min(2).max(4),
});
export type ExperimentInput = z.infer<typeof ExperimentInput>;

export const createExperimentCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: ExperimentInput, ctx): Promise<{ id: string }> => {
    if (i.variants.length !== i.split.length) throw new StudioFailure("invalid");
    const versions = new Set(i.variants.map((v) => v.weightsVersion));
    if (versions.size !== i.variants.length)
      throw new StudioFailure("invalid", REC_TEXT.experimentSameVersion);
    const history = await weightsHistory(ctx.db);
    for (const v of versions) {
      const w = history.find((h) => h.version === v);
      if (!w || !w.approvedBy || !w.weights)
        throw new StudioFailure("invalid", REC_TEXT.experimentNeedsApproved);
    }
    const { data, error } = await ctx.db
      .from("rec_experiments")
      .insert({
        name: i.name,
        variants: i.variants as NonNullable<Json>,
        split: i.split,
        created_by: ctx.userId,
      })
      .select("id")
      .single();
    if (error || !data) {
      if (error?.code === "42501") throw new StudioFailure("forbidden", AB_TEXT.forbidden);
      throw new Error(`rec_experiments insert: ${error?.message ?? "sem retorno"}`);
    }
    ctx.setObjectRef(`rec_experiment:${data.id}`);
    ctx.detail({ ...i });
    return { id: data.id };
  },
  { schema: ExperimentInput, auditAs: "rec.experiment.create", objectRef: () => "rec_experiment:" },
);

const EndInput = z.object({ id: z.uuid() });

export const endExperimentCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: z.infer<typeof EndInput>, ctx): Promise<void> => {
    const { data, error } = await ctx.db
      .from("rec_experiments")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", i.id)
      .eq("status", "running")
      .select("id");
    if (error) throw new Error(`rec_experiments update: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
  },
  { schema: EndInput, auditAs: "rec.experiment.end", objectRef: (i) => `rec_experiment:${i.id}` },
);

const PromoteInput = z.object({
  id: z.uuid(),
  variant: z.number().int().min(0).max(3),
  justification: z.string().trim().min(1, REC_TEXT.justificationRequired).max(2000),
});
export type PromoteInput = z.infer<typeof PromoteInput>;

/**
 * Promover a variante vencedora: encerra o teste e propõe os pesos dela como versão nova com
 * pedido `rec.weights`; quem promove e pode aprovar ativa na mesma ação (A-128).
 */
export const promoteExperimentCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: PromoteInput, ctx): Promise<ProposeWeightsOutcome> => {
    const exp = await experimentById(i.id, ctx.db);
    if (!exp) throw new StudioFailure("not_found");
    const variant = exp.variants[i.variant];
    if (!variant) throw new StudioFailure("invalid");
    const history = await weightsHistory(ctx.db);
    const source = history.find((h) => h.version === variant.weightsVersion);
    if (!source?.weights) throw new StudioFailure("invalid", REC_TEXT.experimentNeedsApproved);
    const active = history.find((h) => h.active);
    const version = await insertWeights(ctx, source.weights, {
      cap: source.cap,
      discoveryEvery: source.discoveryEvery,
    });
    const { error } = await ctx.db
      .from("rec_experiments")
      .update({ status: "promoted", ended_at: new Date().toISOString(), promoted_version: version })
      .eq("id", i.id);
    if (error) throw new Error(`rec_experiments update: ${error.message}`);
    ctx.detail({
      variant: i.variant,
      version,
      from: variant.weightsVersion,
      previousActive: active?.version ?? null,
    });
    const { approvalId, status } = await requestAndActivate(
      ctx,
      version,
      i.justification,
      { version, experimentId: i.id, variant: i.variant, from: variant.weightsVersion },
      { next: source.weights, current: active?.weights ?? null },
    );
    ctx.detail({ approvalId, status });
    return { version, approvalId, status };
  },
  {
    schema: PromoteInput,
    auditAs: "rec.experiment.promote",
    objectRef: (i) => `rec_experiment:${i.id}`,
  },
);

// ---------------------------------------------------------------------------
// Por que esta recomendação
// ---------------------------------------------------------------------------
const ExplainInput = z.object({ anonId: z.uuid(WHY_TEXT.anonIdInvalid) });
export type ExplainInput = z.infer<typeof ExplainInput>;

export interface ExplainOutcome {
  /** Pseudônimo estável (hash), nunca o anonId. */
  pseudonym: string;
  personalization: boolean;
  version: string;
  sources: (ScoreBreakdown & { name: string; reason: string })[];
}

/** Pseudônimo do leitor para tela e auditoria: hash do anonId, nunca o valor cru. */
export function pseudonymOf(anonId: string): string {
  return createHash("sha256").update(`cn-rec:${anonId}`).digest("hex").slice(0, 10);
}

export const explainRecommendationCommand = studioAction(
  "rec.weights",
  noScope,
  async (i: ExplainInput, ctx): Promise<ExplainOutcome> => {
    const pseudonym = pseudonymOf(i.anonId);
    ctx.setObjectRef(`reader:${pseudonym}`);
    // Consentimento vigente = o do último evento do leitor (eventos com anon_id só existem
    // com Personalização; se ela foi revogada, o último evento diz `false`).
    const last = await ctx.db
      .from("events")
      .select("consent")
      .eq("anon_id", i.anonId)
      .order("received_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw new Error(`events: ${last.error.message}`);
    const consent = last.data?.consent;
    const personalization =
      typeof consent === "object" && consent !== null && !Array.isArray(consent)
        ? consent.personalization === true
        : false;
    const history = await weightsHistory(ctx.db);
    const active = history.find((h) => h.active && h.weights);
    const weights = active?.weights ?? REC_V1;
    const signals = await getSourceSignals({
      window: "7d",
      ...(personalization ? { anonId: i.anonId } : {}),
    });
    if (!signals.ok) throw new StudioFailure("conflict", AB_TEXT.genericError);
    const ranked = rankSources(signals.value, {
      list: "recommended",
      limit: 12,
      hidden: [],
      weights,
      personalization,
      cap: active?.cap ?? 0.25,
      discoveryEvery: active?.discoveryEvery ?? 5,
    });
    const byName = new Map(signals.value.map((s) => [s.slug, s.name]));
    ctx.detail({ personalization, sources: ranked.length });
    return {
      pseudonym,
      personalization,
      version: active?.version ?? "rec-v1",
      sources: ranked.map((r) => ({
        ...scoreBreakdown(r, weights, personalization),
        name: byName.get(r.slug) ?? r.slug,
        reason: explainRecommendation(r, {}),
      })),
    };
  },
  { schema: ExplainInput, auditAs: "rec.explain", objectRef: () => "reader:" },
);
