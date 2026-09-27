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
