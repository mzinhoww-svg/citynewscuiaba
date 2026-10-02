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
  /** Algum item marcado sensível pelo agente `classify` (crime, tragédia, saúde individual…). */
  sensitive?: boolean;
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

/** Palavras de um tema: sem acento, minúsculas; hífen, underscore e espaço viram separador. */
const words = (s: string): string[] =>
  normalize(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map((w) => w.replace(/[oa]es$/, "ao"));

/** Raiz de uma palavra do tema: sem a vogal final (crime → crim, eleicao → eleica). */
const root = (w: string): string => (w.length > 3 ? w.replace(/[aeo]$/, "") : w);
/** Flexões aceitas depois da raiz: gênero e número. "morteiro" não casa com "morte". */
const INFLECTION = new Set(["", "a", "e", "o", "as", "es", "os"]);

const wordMatches = (tagWord: string, termWord: string): boolean => {
  const r = root(termWord);
  return tagWord.startsWith(r) && INFLECTION.has(tagWord.slice(r.length));
};

/** O tema casa se as palavras dele aparecem em sequência no rótulo, cada uma pela raiz. */
function sensitiveMatch(tag: string, term: string): boolean {
  const t = words(tag);
  const w = words(term);
  if (w.length === 0) return false;
  for (let i = 0; i + w.length <= t.length; i++) {
    if (w.every((termWord, j) => wordMatches(t[i + j]!, termWord))) return true;
  }
  return false;
}

/**
 * Segurança e a subárvore dela (`seguranca-*`) nunca publicam sozinhas (CLAUDE.md §5.8): trava
 * dura no código, independente do modo que estiver na tabela de regras.
 */
export const isSafetyCategory = (category: string): boolean => {
  const key = normalize(category);
  return key === "seguranca" || key.startsWith("seguranca-");
};

const isCount = (n: number): boolean => Number.isInteger(n) && n >= 0;
const isScore = (n: number): boolean => Number.isFinite(n) && n >= 0 && n <= 1;

function invalidInput(c: Candidate, rules: RuleSet): string[] {
  const bad: string[] = [];
  if (!isCount(c.independentSources)) bad.push("independentSources");
  if (!isCount(c.primarySources)) bad.push("primarySources");
  if (!isScore(c.confidenceScore)) bad.push("confidenceScore");
  const key = normalize(c.category);
  const cat = Object.hasOwn(rules.categories, key) ? rules.categories[key] : undefined;
  if (cat) {
    if (!isCount(cat.minSources)) bad.push(`${key}.minSources`);
    if (cat.minScore !== null && !isScore(cat.minScore)) bad.push(`${key}.minScore`);
  }
  return bad;
}

const review = (rule: string, rationale: string): Decision => ({
  route: "review",
  rule,
  rationale,
});

/**
 * Decide o destino de um candidato à publicação. A primeira regra que se aplica decide, na ordem:
 * invalid_input → breaking → sensitive → forceReview → Segurança (sempre hold) → unknown_category → blocked → min_sources / primary →
 * conflict → image → min_score → modo da categoria. Nada fora da tabela publica sozinho.
 */
export function decidePublication(c: Candidate, rules: RuleSet): Decision {
  // Falha fechado: número não finito, negativo ou fora da faixa nunca publica.
  const bad = invalidInput(c, rules);
  if (bad.length > 0) return review("invalid_input", T.invalidInput(bad));

  if (c.breaking) return review("breaking", T.breaking());

  const hits = [c.category, ...c.tags].filter((t) =>
    rules.sensitiveTopics.some((term) => sensitiveMatch(t, term)),
  );
  if (hits.length > 0) return review("sensitive", T.sensitive(hits));
  if (c.sensitive) return review("sensitive", T.sensitiveFlag());

  if (rules.forceReview) return review("force_review", T.forceReview(rules.version));

  const key = normalize(c.category);
  if (isSafetyCategory(key)) return { route: "hold", rule: "blocked", rationale: T.blocked(key) };
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
