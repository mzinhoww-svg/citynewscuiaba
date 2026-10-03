import type { CategoryRule, RuleSet } from "./types";

const rule = (
  mode: CategoryRule["mode"],
  minSources: number,
  requirePrimary: boolean,
  requireApprovedImage: boolean,
  minScore: number | null,
  summaryWords: number | null,
): CategoryRule => ({
  mode,
  minSources,
  requirePrimary,
  requireApprovedImage,
  minScore,
  summaryWords,
});

/** Regras de autonomia v1 (spec §6.4). `forceReview` fica ligado no MVP. */
export const DEFAULT_RULES: RuleSet = {
  version: 1,
  forceReview: true,
  neverAuto: ["seguranca"],
  breakingReview: true,
  sensitiveFlagReview: true,
  sensitiveTopics: [
    "crime",
    "violencia",
    "morte",
    "tragedia",
    "acidente",
    "suicidio",
    "abuso",
    "saude-individual",
    "eleicoes",
    "homicidio",
    "assassinato",
    "estupro",
    "feminicidio",
    "sequestro",
    "overdose",
  ],
  categories: {
    servicos: rule("auto", 2, false, false, 0.6, 60),
    agenda: rule("auto", 1, true, false, 0.8, 60),
    clima: rule("auto", 1, true, false, 0.8, 40),
    cidade: rule("auto_notify", 2, true, true, 0.85, 80),
    economia: rule("auto_notify", 2, true, true, 0.85, 80),
    esportes: rule("auto_notify", 2, false, true, 0.6, 60),
    cultura: rule("review", 2, false, true, null, 80),
    politica: rule("review", 3, true, true, null, 100),
    saude: rule("review", 2, true, true, null, 80),
    seguranca: rule("blocked", 0, false, false, null, null),
  },
};

const v3Category = (minSources: number, summaryWords: number | null): CategoryRule =>
  rule("auto", minSources, false, false, 0.3, summaryWords);

/**
 * Regras v3 de autonomia alta (spec 2026-10-03, A1 a A8; pré-aprovadas pelo dono). Score mínimo
 * 0,30, todas as editorias em `auto` (segurança incluída), nada fixo em `neverAuto`, tema
 * sensível e breaking deixam de ser portão. Nasce como proposta INATIVA
 * (`supabase/bootstrap/rules-v3-proposal.sql`); o dono ativa no painel de governança.
 */
export const RULES_V3: RuleSet = {
  version: 3,
  forceReview: false,
  neverAuto: [],
  breakingReview: false,
  sensitiveFlagReview: false,
  sensitiveTopics: [],
  categories: {
    servicos: v3Category(1, 60),
    agenda: v3Category(1, 60),
    clima: v3Category(1, 40),
    cidade: v3Category(1, 80),
    economia: v3Category(1, 80),
    esportes: v3Category(1, 60),
    cultura: v3Category(1, 80),
    politica: v3Category(1, 100),
    saude: v3Category(1, 80),
    seguranca: v3Category(1, 80),
  },
};
