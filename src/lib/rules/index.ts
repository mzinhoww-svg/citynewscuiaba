import { RULE_RATIONALE as T } from "@/content/pt-BR/rules";
import type { RuleSet } from "./types";

export type { CategoryRule, Mode, RuleSet } from "./types";

export interface Candidate {
  category: string;
  tags: string[];
  independentSources: number;
  primarySources: number;
  centralConflict: boolean;
  imageApproved: boolean;
  confidenceScore: number;
  breaking: boolean;
}

export type Route = "publish" | "publish_notify" | "review" | "hold";

export interface Decision {
  route: Route;
  rule: string;
  rationale: string;
}

const normalize = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();

const review = (rule: string, rationale: string): Decision => ({
  route: "review",
  rule,
  rationale,
});

/**
 * Decide o destino de um candidato à publicação. A primeira regra que se aplica decide, na ordem:
 * breaking → sensitive → forceReview → unknown_category → blocked → min_sources / primary →
 * conflict → image → min_score → modo da categoria. Nada fora da tabela publica sozinho.
 */
export function decidePublication(c: Candidate, rules: RuleSet): Decision {
  if (c.breaking) return review("breaking", T.breaking());

  const sensitive = new Set(rules.sensitiveTopics.map(normalize));
  const hits = [c.category, ...c.tags].filter((t) => sensitive.has(normalize(t)));
  if (hits.length > 0) return review("sensitive", T.sensitive(hits));

  if (rules.forceReview) return review("force_review", T.forceReview(rules.version));

  const key = normalize(c.category);
  const cat = Object.hasOwn(rules.categories, key) ? rules.categories[key] : undefined;
  if (!cat) return review("unknown_category", T.unknownCategory(c.category));

  if (cat.mode === "blocked") return { route: "hold", rule: "blocked", rationale: T.blocked(key) };

  if (c.independentSources < cat.minSources)
    return review("min_sources", T.minSources(c.independentSources, cat.minSources, key));
  if (cat.requirePrimary && c.primarySources < 1) return review("primary", T.primary(key));

  if (c.centralConflict) return review("conflict", T.conflict());

  if (cat.requireApprovedImage && !c.imageApproved) return review("image", T.image(key));

  if (cat.minScore !== null && c.confidenceScore < cat.minScore)
    return review("min_score", T.minScore(c.confidenceScore, cat.minScore, key));

  switch (cat.mode) {
    case "auto":
      return {
        route: "publish",
        rule: "mode",
        rationale: T.modeAuto(key, c.confidenceScore, c.independentSources),
      };
    case "auto_notify":
      return {
        route: "publish_notify",
        rule: "mode",
        rationale: T.modeAutoNotify(key, c.confidenceScore, c.independentSources),
      };
    case "review":
      return review("mode", T.modeReview(key));
  }
}
