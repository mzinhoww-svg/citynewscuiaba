import "server-only";
import { z } from "zod";
import { RULES_TEXT as T } from "@/content/pt-BR/rules-admin";
import { rulesTarget } from "@/lib/approvals/targets";
import type { Json } from "@/lib/db/types";
import { nextRuleVersion, recentCandidates, rulesOverview } from "@/lib/db/queries/rules";
import { DEFAULT_RULES } from "@/lib/rules/defaults";
import {
  ruleDiff,
  simulateRules,
  validateRuleSet,
  weakensSafety,
  type Simulation,
} from "@/lib/rules/simulate";
import type { RuleSet } from "@/lib/rules";
import { canAccess } from "@/lib/auth/permissions";
import { StudioFailure, studioAction, type StudioResult } from "./action";
import { studioContext } from "./context";
import { evaluateGovernance } from "@/lib/governance";
import { requestAndApproveCommand } from "./approvals";

/*
 * Regras de autonomia (O05, P5-T2): simular e propor. A proposta nasce inativa em nome de quem
 * propõe (RLS `rules_propose` + `guard_proposal`) e registra um pedido `rules.activate` (ou
 * `force_review.disable`, quando desliga a revisão obrigatória, ou `safety.disable`, quando tira
 * tema sensível). A-128: se quem propõe tem o papel que aprova o tipo, aprova e `approval_apply`
 * ativa a versão na mesma ação; sem o papel, o pedido fica na caixa de aprovações. O histórico
 * (approvals + auditoria) guarda quem propôs e quem aprovou.
 */

const CategoryRuleSchema = z.object({
  mode: z.enum(["auto", "auto_notify", "review", "blocked"]),
  minSources: z.number().int().min(0).max(10),
  requirePrimary: z.boolean(),
  requireApprovedImage: z.boolean(),
  minScore: z.number().min(0).max(1).nullable(),
  summaryWords: z.number().int().min(0).max(500).nullable(),
});

export const RuleSetInput = z.object({
  forceReview: z.boolean(),
  sensitiveTopics: z.array(z.string().trim().min(1).max(60)).max(100),
  /** Ausentes: herdam da versão ativa (a tela de regras ainda não edita estes campos). */
  neverAuto: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .max(50)
    .optional(),
  breakingReview: z.boolean().optional(),
  sensitiveFlagReview: z.boolean().optional(),
  categories: z.record(z.string().regex(/^[a-z0-9-]+$/), CategoryRuleSchema),
});
export type RuleSetInput = z.infer<typeof RuleSetInput>;

const noScope = () => ({});

/** Completa os campos de portão que a tela não envia com os da versão em vigor. */
function withGates(input: RuleSetInput, current: RuleSet): Omit<RuleSet, "version"> {
  return {
    ...input,
    neverAuto: input.neverAuto ?? current.neverAuto,
    breakingReview: input.breakingReview ?? current.breakingReview,
    sensitiveFlagReview: input.sensitiveFlagReview ?? current.sensitiveFlagReview,
  };
}

export interface SimulationReply extends Simulation {
  diff: ReturnType<typeof ruleDiff>;
  currentVersion: number | null;
}

/**
 * Simula a proposta contra os candidatos dos últimos 7 dias e lista o diff. Só leitura: exige o
 * papel de propor, mas não grava auditoria (uma simulação não muda nada).
 */
export async function simulateRulesCommand(
  raw: RuleSetInput,
): Promise<StudioResult<SimulationReply>> {
  const parsed = RuleSetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "invalid", message: T.form.invalid };
  const ctx = await studioContext();
  if (!ctx.session || !canAccess(ctx.session.roles, "rules.propose"))
    return { ok: false, error: "forbidden", message: T.form.forbidden };
  const [overview, sample] = await Promise.all([
    rulesOverview(ctx.db),
    recentCandidates(7, ctx.db),
  ]);
  const current = overview.active?.rules ?? { ...DEFAULT_RULES, forceReview: true };
  const next = validateRuleSet({ version: 0, ...withGates(parsed.data, current) });
  if (!next.ok) return { ok: false, error: "invalid", message: next.error };
  const sim = simulateRules(next.value, sample, current);
  return {
    ok: true,
    value: {
      ...sim,
      diff: ruleDiff(current, next.value),
      currentVersion: overview.active?.version ?? null,
    },
  };
}

const ProposeInput = z.object({
  rules: RuleSetInput,
  justification: z.string().trim().min(1, T.form.justificationRequired).max(2000),
});
export type ProposeInput = z.infer<typeof ProposeInput>;

export interface ProposeOutcome {
  version: number;
  approvalId: string | null;
  kind: "rules.activate" | "force_review.disable" | "safety.disable";
  /** `applied`: a versão já está em vigor; `pending`: aguarda quem tem o papel de aprovar. */
  status: "applied" | "pending";
}

export const proposeRulesCommand = studioAction(
  "rules.propose",
  noScope,
  async (i: ProposeInput, ctx): Promise<ProposeOutcome> => {
    const overview = await rulesOverview(ctx.db);
    const current = overview.active?.rules ?? { ...DEFAULT_RULES, forceReview: true };
    const proposed = withGates(i.rules, current);
    const diff = ruleDiff(current, { version: 0, ...proposed });
    if (diff.length === 0) throw new StudioFailure("invalid", T.form.noChanges);

    let version = await nextRuleVersion(ctx.db);
    let inserted = false;
    for (let attempt = 0; attempt < 3 && !inserted; attempt++) {
      const body: RuleSet = { version, ...proposed };
      const valid = validateRuleSet(body);
      if (!valid.ok) throw new StudioFailure("invalid", valid.error);
      const { error } = await ctx.db.from("rules").insert({
        version,
        body: body as unknown as NonNullable<Json>,
        force_review: i.rules.forceReview,
        proposed_by: ctx.userId,
      });
      if (!error) inserted = true;
      else if (error.code === "23505") version++;
      else if (error.code === "42501") throw new StudioFailure("forbidden", T.form.forbidden);
      else throw new Error(`rules insert: ${error.message}`);
    }
    if (!inserted) throw new StudioFailure("conflict", T.form.conflict);

    // Tirar tema sensível enfraquece a Segurança: pedido `safety.disable`, só admin aprova.
    const kind = weakensSafety(current, { version: 0, ...proposed })
      ? "safety.disable"
      : current.forceReview && !i.rules.forceReview
        ? "force_review.disable"
        : "rules.activate";
    // Motor de política (A-133): regras válidas e papel certo aplicam na hora; inválidas são
    // recusadas; afrouxar a segurança sem ser admin é exceção (ação do admin).
    const next: RuleSet = { version, ...proposed };
    const sim = simulateRules(next, await recentCandidates(7, ctx.db), current);
    const policy = evaluateGovernance({
      kind,
      actorRoles: ctx.session?.roles.map((r) => r.role) ?? [],
      current,
      next,
      simulation: { changed: sim.changed, total: sim.total },
    });
    const approval = await requestAndApproveCommand({
      kind,
      targetRef: rulesTarget(version),
      justification: i.justification,
      details: { version, diff },
      policy,
    });
    ctx.setObjectRef(rulesTarget(version));
    ctx.detail({ version, kind, diff, justification: i.justification });
    if (!approval.ok) throw new StudioFailure(approval.error, approval.message);
    const status = approval.value.status === "applied" ? "applied" : "pending";
    return { version, approvalId: approval.value.id, kind, status };
  },
  { schema: ProposeInput, auditAs: "rules.propose", objectRef: () => "rules:" },
);
