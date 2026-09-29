import { foldKey, isNeverAutoCategory } from "./safety";
import type { CategoryRule, RuleSet } from "./types";

/*
 * O que torna uma versão de regras uma mudança crítica (spec §8; plano P5 Task 2). Funções
 * puras espelhadas no banco (`rules_kinds_between`, migration 0028): o teste de integração
 * confere as duas. O banco é quem manda: sem as aprovações exigidas aqui, a versão não ativa.
 */

export type RuleApprovalKind = "rules.activate" | "safety.disable" | "force_review.disable";

/** Base usada quando não há versão ativa: a mais restrita (forceReview ligado, Segurança bloqueada). */
const BASELINE: RuleSet = {
  version: 0,
  forceReview: true,
  sensitiveTopics: [],
  categories: {
    seguranca: {
      mode: "blocked",
      minSources: 0,
      requirePrimary: false,
      requireApprovedImage: false,
      minScore: null,
      summaryWords: null,
    },
  },
};

export interface SafetyWeakening {
  /** Temas sensíveis da versão atual que a nova não tem (comparação sem acento e sem caixa). */
  removedTopics: string[];
  /** Categorias que nunca publicam sozinhas e deixaram de estar bloqueadas. */
  unblocked: string[];
}

function modeOf(rules: RuleSet, folded: string): CategoryRule["mode"] | null {
  for (const [key, rule] of Object.entries(rules.categories)) {
    if (foldKey(key) === folded) return rule.mode;
  }
  return null;
}

/** O que a versão nova afrouxa nas regras de segurança em relação à atual. */
export function safetyWeakened(current: RuleSet | null, next: RuleSet): SafetyWeakening {
  const base = current ?? BASELINE;
  const nextTopics = new Set(next.sensitiveTopics.map(foldKey));
  const removedTopics = base.sensitiveTopics.filter((t) => !nextTopics.has(foldKey(t)));
  const unblocked = Object.entries(base.categories)
    .filter(([key, rule]) => isNeverAutoCategory(key) && rule.mode === "blocked")
    .filter(([key]) => modeOf(next, foldKey(key)) !== "blocked")
    .map(([key]) => key);
  return { removedTopics, unblocked };
}

/**
 * Tipos de aprovação que a versão nova exige: `force_review.disable` se desliga a revisão
 * obrigatória; `safety.disable` se tira tema sensível ou desbloqueia Segurança; senão
 * `rules.activate`. A versão só entra em vigor com todos aprovados por outra pessoa.
 */
export function requiredRuleKinds(current: RuleSet | null, next: RuleSet): RuleApprovalKind[] {
  const base = current ?? BASELINE;
  const kinds: RuleApprovalKind[] = [];
  if (base.forceReview && !next.forceReview) kinds.push("force_review.disable");
  const w = safetyWeakened(current, next);
  if (w.removedTopics.length > 0 || w.unblocked.length > 0) kinds.push("safety.disable");
  return kinds.length > 0 ? kinds : ["rules.activate"];
}

export type RuleProblemCode = "never_auto" | "range" | "empty";
export interface RuleProblem {
  field: string;
  code: RuleProblemCode;
}

const intIn = (n: number, min: number, max: number) => Number.isInteger(n) && n >= min && n <= max;

/**
 * Problemas de uma proposta (a tela mostra e o banco recusa os de segurança): Segurança e
 * categorias urgentes só em `blocked` ou `review`; fontes 0 a 10; confiança 0 a 1; resumo de
 * 10 a 400 palavras; ao menos um tema sensível.
 */
export function ruleProblems(rules: RuleSet): RuleProblem[] {
  const out: RuleProblem[] = [];
  const topics = rules.sensitiveTopics.filter((t) => t.trim() !== "");
  if (topics.length === 0 || topics.length !== rules.sensitiveTopics.length)
    out.push({ field: "sensitiveTopics", code: "empty" });
  for (const [key, r] of Object.entries(rules.categories)) {
    const f = (name: string) => `categories.${key}.${name}`;
    if (isNeverAutoCategory(key) && (r.mode === "auto" || r.mode === "auto_notify"))
      out.push({ field: f("mode"), code: "never_auto" });
    if (!intIn(r.minSources, 0, 10)) out.push({ field: f("minSources"), code: "range" });
    if (r.minScore !== null && !(Number.isFinite(r.minScore) && r.minScore >= 0 && r.minScore <= 1))
      out.push({ field: f("minScore"), code: "range" });
    if (r.summaryWords !== null && !intIn(r.summaryWords, 10, 400))
      out.push({ field: f("summaryWords"), code: "range" });
  }
  return out;
}

export type RuleValue = string | number | boolean | null | string[];
export interface RuleChange {
  /** Caminho do campo (`forceReview`, `sensitiveTopics`, `categories.<cat>.<campo>`). */
  field: string;
  category: string | null;
  /** Campo dentro da categoria, `exists` para categoria criada ou removida. */
  key: string;
  from: RuleValue;
  to: RuleValue;
}

const CATEGORY_FIELDS = [
  "mode",
  "minSources",
  "requirePrimary",
  "requireApprovedImage",
  "minScore",
  "summaryWords",
] as const;

/**
 * Diferença entre duas versões, campo a campo. Temas sensíveis: `from` = removidos, `to` =
 * acrescentados (sem acento e sem caixa).
 */
export function diffRules(a: RuleSet, b: RuleSet): RuleChange[] {
  const out: RuleChange[] = [];
  if (a.forceReview !== b.forceReview)
    out.push({
      field: "forceReview",
      category: null,
      key: "forceReview",
      from: a.forceReview,
      to: b.forceReview,
    });
  const aT = new Set(a.sensitiveTopics.map(foldKey));
  const bT = new Set(b.sensitiveTopics.map(foldKey));
  const removed = a.sensitiveTopics.filter((t) => !bT.has(foldKey(t)));
  const added = b.sensitiveTopics.filter((t) => !aT.has(foldKey(t)));
  if (removed.length > 0 || added.length > 0)
    out.push({
      field: "sensitiveTopics",
      category: null,
      key: "sensitiveTopics",
      from: removed,
      to: added,
    });
  const keys = [...new Set([...Object.keys(a.categories), ...Object.keys(b.categories)])];
  for (const key of keys) {
    const ra = Object.hasOwn(a.categories, key) ? a.categories[key] : undefined;
    const rb = Object.hasOwn(b.categories, key) ? b.categories[key] : undefined;
    if (!ra || !rb) {
      out.push({
        field: `categories.${key}`,
        category: key,
        key: "exists",
        from: Boolean(ra),
        to: Boolean(rb),
      });
      continue;
    }
    for (const name of CATEGORY_FIELDS) {
      if (ra[name] !== rb[name])
        out.push({
          field: `categories.${key}.${name}`,
          category: key,
          key: name,
          from: ra[name],
          to: rb[name],
        });
    }
  }
  return out;
}
