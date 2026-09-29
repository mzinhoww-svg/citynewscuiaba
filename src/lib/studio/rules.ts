import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { RULES_ADMIN_TEXT as T } from "@/content/pt-BR/control-rules";
import { requestApproval, isCriticalKind, normalizeJustification } from "@/lib/approvals";
import { canAccess } from "@/lib/auth/permissions";
import type { Json } from "@/lib/db/types";
import { recentCandidates, SIMULATION_DAYS } from "@/lib/db/queries/rules";
import type { RuleSet } from "@/lib/rules";
import {
  diffRules,
  requiredRuleKinds,
  ruleProblems,
  type RuleApprovalKind,
  type RuleChange,
} from "@/lib/rules/critical";
import { parseRuleRow, resolveRules } from "@/lib/rules/load";
import { foldKey } from "@/lib/rules/safety";
import { simulateRules, type Simulation } from "@/lib/rules/simulate";
import { studioAction, StudioFailure, type StudioResult } from "./action";
import { studioContext, type StudioContext } from "./context";

/*
 * Regras de autonomia no Control Center (plano P5 Task 2): simular uma proposta sobre os
 * candidatos reais dos últimos 7 dias e propor a versão com justificativa. A proposta nasce
 * inativa (guard_proposal) e pede as aprovações que o banco exige para ela
 * (`rules_required_kinds`); só entra em vigor quando outra pessoa aprova (approval_decide).
 */

const CategoryInput = z.object({
  mode: z.enum(["auto", "auto_notify", "review", "blocked"]),
  minSources: z.number(),
  requirePrimary: z.boolean(),
  requireApprovedImage: z.boolean(),
  minScore: z.number().nullable(),
  summaryWords: z.number().nullable(),
});

const RulesInput = z.object({
  forceReview: z.boolean(),
  sensitiveTopics: z.array(z.string().max(60)).max(100),
  categories: z
    .record(z.string().min(1).max(40), CategoryInput)
    .refine((c) => Object.keys(c).length <= 40, "Categorias demais."),
});
export type RulesDraft = z.infer<typeof RulesInput>;

export interface SimulationReport extends Simulation {
  days: number;
  sampleSize: number;
  /** Versão em vigor usada na comparação (`null` sem versão ativa). */
  currentVersion: number | null;
  kinds: RuleApprovalKind[];
  changes: RuleChange[];
  /** Selo da proposta simulada: propor exige a mesma proposta sobre a mesma versão em vigor. */
  digest: string;
}

/** Proposta limpa: temas aparados, sem vazios nem repetidos (sem acento e sem caixa). */
export function normalizeDraft(draft: RulesDraft, version: number): RuleSet {
  const seen = new Set<string>();
  const sensitiveTopics: string[] = [];
  for (const t of draft.sensitiveTopics.map((x) => x.trim())) {
    const k = foldKey(t);
    if (t === "" || seen.has(k)) continue;
    seen.add(k);
    sensitiveTopics.push(t);
  }
  return {
    version,
    forceReview: draft.forceReview,
    sensitiveTopics,
    categories: draft.categories,
  };
}

const digestOf = (next: RuleSet, currentVersion: number | null) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        currentVersion,
        next.forceReview,
        next.sensitiveTopics,
        Object.entries(next.categories),
      ]),
    )
    .digest("hex")
    .slice(0, 32);

async function activeRules(ctx: StudioContext): Promise<RuleSet | null> {
  const { data, error } = await ctx.db
    .from("rules")
    .select("version, body, force_review")
    .eq("active", true)
    .order("version", { ascending: false })
    .limit(2);
  if (error) throw new Error(`regras: ${error.message}`);
  if (!data || data.length !== 1) return null;
  const parsed = parseRuleRow(data[0]!);
  return parsed.ok ? parsed.value : null;
}

function problemMessage(next: RuleSet): string | null {
  const problems = ruleProblems(next);
  if (problems.length === 0) return null;
  return problems.map((p) => T.problem(p.field, p.code)).join(" ");
}

type SimulateError = "forbidden" | "invalid";
export type SimulateResult =
  { ok: true; value: SimulationReport } | { ok: false; error: SimulateError; message: string };

/**
 * Simula a proposta com os candidatos dos últimos 7 dias contra a versão em vigor (sem versão
 * válida em vigor, contra as regras de reserva do pipeline). Só leitura: não audita.
 */
export async function simulateProposal(input: { rules: RulesDraft }): Promise<SimulateResult> {
  const parsed = RulesInput.safeParse(input?.rules);
  if (!parsed.success) return { ok: false, error: "invalid", message: T.invalidDraft };
  const ctx = await studioContext();
  if (!ctx.session || !canAccess(ctx.session.roles, "rules.propose"))
    return { ok: false, error: "forbidden", message: T.forbidden };
  const current = await activeRules(ctx);
  const next = normalizeDraft(parsed.data, (current?.version ?? 0) + 1);
  const problem = problemMessage(next);
  if (problem) return { ok: false, error: "invalid", message: problem };
  const baseline = current ?? resolveRules({ ok: false, error: "sem versão ativa" }).rules;
  const sample = await recentCandidates(ctx.now());
  const sim = simulateRules(next, sample, baseline);
  return {
    ok: true,
    value: {
      ...sim,
      days: SIMULATION_DAYS,
      sampleSize: sample.length,
      currentVersion: current?.version ?? null,
      kinds: requiredRuleKinds(current, next),
      changes: diffRules(baseline, next),
      digest: digestOf(next, current?.version ?? null),
    },
  };
}

const ProposeInput = z.object({
  rules: RulesInput,
  justification: z.string().max(4000),
  digest: z.string().max(64),
});
export type ProposeInput = z.infer<typeof ProposeInput>;

export interface ProposeOutput {
  version: number;
  approvals: { id: string; kind: RuleApprovalKind }[];
}

async function insertProposal(ctx: StudioContext, userId: string, next: RuleSet): Promise<number> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: top, error: e1 } = await ctx.db
      .from("rules")
      .select("version")
      .order("version", { ascending: false })
      .limit(1);
    if (e1) throw new Error(`regras: ${e1.message}`);
    const version = (top?.[0]?.version ?? 0) + 1 + attempt;
    const body: Json = {
      version,
      forceReview: next.forceReview,
      sensitiveTopics: next.sensitiveTopics,
      categories: Object.fromEntries(
        Object.entries(next.categories).map(([key, rule]) => [key, { ...rule }]),
      ),
    };
    const { error } = await ctx.db.from("rules").insert({
      version,
      body,
      force_review: next.forceReview,
      proposed_by: userId,
    });
    if (!error) return version;
    if (error.code === "23505") continue;
    if (error.code === "23514") throw new StudioFailure("invalid", T.neverAutoDb);
    if (error.code === "42501") throw new StudioFailure("forbidden", T.forbidden);
    throw new Error(`regras: ${error.message}`);
  }
  throw new StudioFailure("conflict", T.versionRace);
}

/**
 * Propõe a versão e pede as aprovações exigidas pelo banco para ela (`rules.activate`, ou
 * `force_review.disable` e/ou `safety.disable` quando desliga a revisão obrigatória ou uma
 * regra de segurança). Exige a simulação da mesma proposta sobre a mesma versão em vigor.
 */
export const proposeRules: (input: ProposeInput) => Promise<StudioResult<ProposeOutput>> =
  studioAction(
    "rules.propose",
    () => ({}),
    async (input, ctx) => {
      const justification = normalizeJustification(input.justification);
      if (justification === null) throw new StudioFailure("invalid", T.justificationRequired);
      const current = await activeRules(ctx);
      const next = normalizeDraft(input.rules, 0);
      const problem = problemMessage(next);
      if (problem) throw new StudioFailure("invalid", problem);
      if (input.digest !== digestOf(next, current?.version ?? null))
        throw new StudioFailure("invalid", T.simulateFirst);

      const version = await insertProposal(ctx, ctx.userId, next);
      ctx.setObjectRef(`rules:${version}`);
      const { data: kinds, error } = await ctx.db.rpc("rules_required_kinds", {
        p_version: version,
      });
      if (error) throw new Error(`regras: ${error.message}`);
      const approvals: ProposeOutput["approvals"] = [];
      for (const kind of kinds ?? []) {
        if (!isCriticalKind(kind) || !isRuleKind(kind)) continue;
        const r = await requestApproval({ kind, targetRef: String(version), justification });
        if (!r.ok)
          throw new StudioFailure(r.error === "forbidden" ? "forbidden" : "invalid", r.message);
        approvals.push({ id: r.value.id, kind });
      }
      ctx.detail({ version, kinds: approvals.map((a) => a.kind) });
      return { version, approvals };
    },
    { schema: ProposeInput, objectRef: () => "rules:nova" },
  );

function isRuleKind(kind: string): kind is RuleApprovalKind {
  return kind === "rules.activate" || kind === "safety.disable" || kind === "force_review.disable";
}
