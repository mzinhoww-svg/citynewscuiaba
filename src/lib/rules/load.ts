import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { DEFAULT_RULES } from "./defaults";
import type { RuleSet } from "./types";

const CategoryRuleSchema = z.object({
  mode: z.enum(["auto", "auto_notify", "review", "blocked"]),
  minSources: z.number(),
  requirePrimary: z.boolean(),
  requireApprovedImage: z.boolean(),
  minScore: z.number().nullable(),
  summaryWords: z.number().nullable(),
});

const RuleBodySchema = z.object({
  forceReview: z.boolean().optional(),
  sensitiveTopics: z.array(z.string()),
  neverAuto: z.array(z.string()).optional(),
  breakingReview: z.boolean().optional(),
  sensitiveFlagReview: z.boolean().optional(),
  riskLevels: z.boolean().optional(),
  categories: z.record(z.string(), CategoryRuleSchema),
});

/**
 * Linha de `rules` → `RuleSet`. A versão vem da coluna; `forceReview` liga se a coluna ou o
 * corpo pedirem (o mais restritivo vence). Corpo inválido é erro (quem chama falha fechado).
 */
export function parseRuleRow(row: {
  version: number;
  force_review: boolean;
  body: unknown;
}): Result<RuleSet, string> {
  const body = RuleBodySchema.safeParse(row.body);
  if (!body.success)
    return err(`regras v${row.version} inválidas: ${body.error.issues[0]?.message ?? ""}`);
  // Corpo sem `neverAuto` é anterior à v3: mantém os portões antigos (Segurança bloqueada,
  // breaking e sensível em revisão). Só um corpo v3 explícito os libera (decisão do dono, A2/A4).
  const legacy = body.data.neverAuto === undefined;
  return ok({
    version: row.version,
    forceReview: row.force_review || body.data.forceReview !== false,
    neverAuto: body.data.neverAuto ?? ["seguranca"],
    breakingReview: body.data.breakingReview ?? legacy,
    sensitiveFlagReview: body.data.sensitiveFlagReview ?? legacy,
    riskLevels: body.data.riskLevels ?? false,
    sensitiveTopics: body.data.sensitiveTopics,
    categories: body.data.categories,
  });
}

export interface ResolvedRules {
  rules: RuleSet;
  /** `null` quando as regras não carregaram. */
  rulesVersion: number | null;
  failure: string | null;
}

/**
 * Regras usadas na decisão. Nenhuma regra ativa, mais de uma ou erro ao carregar → regras padrão
 * com `forceReview` ligado: nada publica sozinho (falha fechada, CLAUDE.md regra 8).
 */
export function resolveRules(loaded: Result<RuleSet, string>): ResolvedRules {
  if (loaded.ok) return { rules: loaded.value, rulesVersion: loaded.value.version, failure: null };
  return {
    rules: { ...DEFAULT_RULES, forceReview: true },
    rulesVersion: null,
    failure: loaded.error,
  };
}
