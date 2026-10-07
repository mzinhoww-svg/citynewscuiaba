import { RULE_RATIONALE } from "@/content/pt-BR/rules";
import {
  isEligibleForFeature,
  mostLocal,
  NATIONAL_COMMOTION_TAG,
  newsScope,
  type NewsScope,
} from "@/lib/geo/news-scope";
import { err, ok, type Result } from "@/lib/result";
import {
  classifyRisk,
  decidePublication,
  isNeverAutoCategory,
  isSafetyCategory,
  type Candidate,
  type Decision,
  type Risk,
  type RuleSet,
} from "@/lib/rules";
import { resolveRules } from "@/lib/rules/load";
import type { DecisionContext } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { inputHash } from "./understanding";
import type { PublishStepDeps } from "./write";
import { fold as foldText } from "@/lib/text/fold";

const ARTICLE_REF = /^article:(\S+)$/;
/** Etiquetas que marcam notícia urgente (breaking). Só vira revisão se as regras mantêm o portão. */
const BREAKING_TAGS = new Set(["urgente", "breaking", "breaking-news", "ultima-hora", "plantao"]);
export const articleIdFrom = (ref: string): string | null => ARTICLE_REF.exec(ref)?.[1] ?? null;

const fold = (s: string) =>
  foldText(s)
    .trim()
    .replace(/[\s_]+/g, "-");

export function isBreaking(ctx: Pick<DecisionContext, "urgent" | "tags">): boolean {
  return ctx.urgent || ctx.tags.some((t) => BREAKING_TAGS.has(fold(t)));
}

/** Comoção nacional marcada na matéria ou pela classificação dos itens (A15). */
export function hasNationalCommotion(
  ctx: Pick<DecisionContext, "nationalCommotion" | "tags">,
): boolean {
  return ctx.nationalCommotion || ctx.tags.some((t) => fold(t) === NATIONAL_COMMOTION_TAG);
}

/** Escopo da notícia (A15) pelos bairros, municípios e fontes dos itens e pelo título. */
export function newsScopeOf(
  ctx: Pick<DecisionContext, "neighborhoods" | "municipalities" | "sourceLocalities" | "title">,
): NewsScope {
  return newsScope({
    neighborhoods: ctx.neighborhoods,
    municipality: mostLocal(ctx.municipalities),
    sourceLocality: mostLocal(ctx.sourceLocalities) ?? "cuiaba",
    text: ctx.title,
  });
}

/**
 * Urgente e destaque só para o que é local ou regional, ou nacional de comoção (A15). Notícia
 * nacional sem comoção perde o marcador `urgent` (e, sem ele, não gera push urgente).
 */
export function urgentDemoted(
  ctx: Pick<
    DecisionContext,
    | "urgent"
    | "neighborhoods"
    | "municipalities"
    | "sourceLocalities"
    | "title"
    | "nationalCommotion"
    | "tags"
  >,
): boolean {
  return (
    ctx.urgent &&
    !isEligibleForFeature({
      newsScope: newsScopeOf(ctx),
      nationalCommotion: hasNationalCommotion(ctx),
    })
  );
}

/** Assunto grave (A3/A6): segurança, ou item marcado sensível (acusação, saúde individual, tragédia). */
export function isGrave(ctx: Pick<DecisionContext, "category" | "sensitive" | "tags">): boolean {
  return (
    isSafetyCategory(ctx.category) ||
    ctx.sensitive ||
    ctx.tags.some((t) => fold(t) === "saude-individual")
  );
}

export function candidateOf(ctx: DecisionContext): Candidate {
  return {
    category: ctx.category,
    tags: ctx.tags,
    independentSources: ctx.independentSources,
    primarySources: ctx.primarySources,
    centralConflict: ctx.centralConflict,
    imageApproved: ctx.imageApproved,
    confidenceScore: ctx.confidenceScore,
    breaking: isBreaking(ctx),
    sensitive: ctx.sensitive,
    dubious: ctx.dubious,
    sourceTrusted: ctx.sourceTrusted,
    grave: isGrave(ctx),
    newsScope: newsScopeOf(ctx),
  };
}

/**
 * Pode publicar sem pessoa? Defesa em profundidade além de `decidePublication`: rascunho sem IA
 * nunca, e os portões que as regras em vigor ainda mantêm (breaking, sensível, `neverAuto`).
 * Nas regras v3 só sobra o rascunho sem IA.
 */
export function neverAuto(ctx: DecisionContext, rules: RuleSet): boolean {
  return (
    ctx.aiFallback ||
    (rules.breakingReview && isBreaking(ctx)) ||
    (rules.sensitiveFlagReview && ctx.sensitive) ||
    isNeverAutoCategory(ctx.category, rules.neverAuto)
  );
}

const isPublish = (d: Decision) => d.route === "publish" || d.route === "publish_notify";

export interface RouteDecision extends Decision {
  rulesVersion: number | null;
  /** Rota que a regra recomendou antes das travas (flag, IA, falha de regras). */
  recommended: Decision["route"];
  /** Nível de risco editorial e motivos (D-05), registrados em toda decisão. */
  risk: Risk;
}

/**
 * Decisão final: `decidePublication` com as regras ativas; depois as travas que só restringem —
 * regras indisponíveis (falha fechada), rascunho sem IA, flag `auto_publish` desligada ou modo
 * leitura, e as categorias que nunca publicam sozinhas.
 */
export function routeArticle(
  ctx: DecisionContext,
  loaded: Result<RuleSet, string>,
  flags: { autoPublish: boolean; readOnly: boolean },
): RouteDecision {
  const { rules, rulesVersion, failure } = resolveRules(loaded);
  const candidate = candidateOf(ctx);
  const base = decidePublication(candidate, rules);
  const risk = classifyRisk(candidate, { aiFallback: ctx.aiFallback });
  const out = (d: Decision): RouteDecision => ({
    ...d,
    rulesVersion,
    recommended: base.route,
    risk,
  });
  if (failure && base.rule === "force_review")
    return out({
      route: "review",
      rule: "rules_unavailable",
      rationale: RULE_RATIONALE.rulesUnavailable(failure),
    });
  if (base.route === "hold") return out(base);
  if (ctx.aiFallback)
    return out({
      route: "review",
      rule: "ai_unavailable",
      rationale: RULE_RATIONALE.aiUnavailable("rascunho sem IA"),
    });
  if (isPublish(base) && neverAuto(ctx, rules))
    return out({ route: "review", rule: "never_auto", rationale: RULE_RATIONALE.neverAuto() });
  if (isPublish(base) && (!flags.autoPublish || flags.readOnly))
    return out({
      route: "review",
      rule: "auto_publish_off",
      rationale: RULE_RATIONALE.autoPublishOff(),
    });
  return out(base);
}

/** Tipo de notificação de uma decisão que não publica. */
export function notifyKindFor(d: Pick<Decision, "route" | "rule">): string {
  if (d.route === "hold") return "hold";
  if (d.rule === "breaking") return "breaking";
  if (d.rule === "ai_unavailable") return "ai_unavailable";
  if (d.rule === "rules_unavailable") return "rules_unavailable";
  return "review";
}

/**
 * Etapas 15 a 17 (regras, rota e exceção) com registro em `decisions` (etapa 18): toda decisão
 * grava regra, justificativa, versão das regras e confiança. Revisão → `in_review` com o motivo;
 * retenção → `draft`; publicar → etapa `publish`. Idempotente por (matéria, revisão, regras, flags).
 */
const LIVE_STATUS = new Set(["published", "updated"]);

export function createDecideStep(deps: PublishStepDeps): StepHandler {
  return async (msg) => {
    const articleId = articleIdFrom(msg.itemRef);
    if (!articleId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.decisionContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    // Matéria no ar atualizada pela reescrita (A-126): as regras não decidem de novo o que já
    // está publicado; segue para publicar, que reindexa e atualiza a página.
    if (!ctx.humanEdited && ctx.publishMode === "auto" && LIVE_STATUS.has(ctx.status))
      return ok([nextMessage(msg, "publish", msg.itemRef)]);
    if (ctx.humanEdited || (ctx.status !== "draft" && ctx.status !== "in_review")) return ok([]);

    let loaded: Result<RuleSet, string>;
    try {
      loaded = await deps.rules.activeRules();
    } catch (e) {
      loaded = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const flags = {
      autoPublish: await deps.flags.isEnabled("auto_publish"),
      readOnly: await deps.flags.isEnabled("read_only"),
    };
    // Escopo regional (A15): grava o escopo e rebaixa `urgent` de notícia nacional sem comoção.
    const scope = newsScopeOf(ctx);
    const demote = urgentDemoted(ctx);
    const d = routeArticle(demote ? { ...ctx, urgent: false } : ctx, loaded, flags);
    await deps.repo.setStatus(articleId, {
      status: ctx.status,
      newsScope: scope,
      nationalCommotion: hasNationalCommotion(ctx),
      riskLevel: d.risk.level,
      ...(demote ? { urgent: false } : {}),
    });
    const hash = inputHash(
      "rules",
      ctx.version,
      d.rulesVersion,
      String(flags.autoPublish),
      String(flags.readOnly),
      String(ctx.imageApproved),
      loaded.ok ? "" : loaded.error,
    );

    if (!(await deps.repo.findDecision(msg.itemRef, "rules", hash))) {
      const candidate = candidateOf(ctx);
      await deps.repo.recordDecision({
        objectRef: msg.itemRef,
        step: "rules",
        agentId: null,
        promptVersion: null,
        rulesVersion: d.rulesVersion,
        inputHash: hash,
        output: {
          route: d.route,
          rule: d.rule,
          recommended: d.recommended,
          version: ctx.version,
          confidence: { level: ctx.confidence, score: ctx.confidenceScore },
          candidate: { ...candidate },
          risk: d.risk,
          flags,
          rulesError: loaded.ok ? null : loaded.error,
        },
        rationale: d.rationale,
        recommended: d.recommended,
      });
      if (d.route === "review")
        await deps.repo.setStatus(articleId, {
          status: "in_review",
          rulesVersion: d.rulesVersion,
          reviewReason: d.rationale,
        });
      else if (d.route === "hold")
        await deps.repo.setStatus(articleId, {
          status: "draft",
          rulesVersion: d.rulesVersion,
          reviewReason: d.rationale,
        });
    }

    if (isPublish(d)) return ok([nextMessage(msg, "publish", msg.itemRef)]);
    return ok([nextMessage(msg, "notify", `${msg.itemRef}#${notifyKindFor(d)}`)]);
  };
}
