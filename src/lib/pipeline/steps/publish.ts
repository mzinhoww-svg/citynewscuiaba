import { RULE_RATIONALE } from "@/content/pt-BR/rules";
import { err, ok } from "@/lib/result";
import type { DecisionContext } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { articleIdFrom, neverAuto } from "./decide";
import { inputHash } from "./understanding";
import type { PublishStepDeps } from "./write";

/** Tags de cache de uma matéria (architecture §8; `article:<id>` é a do P1). */
export function articleTags(
  a: Pick<DecisionContext, "articleId" | "slug" | "topicId" | "sectionSlug">,
): string[] {
  return [
    `article:${a.articleId}`,
    `article-slug:${a.slug}`,
    ...(a.topicId ? [`topic:${a.topicId}`] : []),
    `section:${a.sectionSlug}`,
    "home",
  ];
}

/**
 * Etapa 17 (publicar). Só publica o que a última decisão de regras mandou publicar para esta
 * revisão da matéria, com `auto_publish` ligado e fora do modo leitura (conferidos de novo aqui).
 * Urgente, sensível, Segurança e rascunho sem IA nunca passam. Grava a decisão com regra,
 * justificativa, versão das regras e confiança; dá para desfazer com `unpublishAuto`.
 */
export function createPublishStep(deps: PublishStepDeps): StepHandler {
  return async (msg) => {
    const articleId = articleIdFrom(msg.itemRef);
    if (!articleId) return err(stepError.invalid(`referência inválida: ${msg.itemRef}`));
    const ctx = await deps.repo.decisionContext(articleId);
    if (!ctx) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    const index = nextMessage(msg, "index", msg.itemRef);
    if (ctx.status === "published" && ctx.publishMode === "auto") return ok([index]);
    if (ctx.humanEdited || (ctx.status !== "draft" && ctx.status !== "in_review")) return ok([]);

    const last = await deps.repo.latestDecision(msg.itemRef, "rules");
    const route = last?.output.route;
    const sameRevision = last?.output.version === ctx.version;
    const autoPublish = await deps.flags.isEnabled("auto_publish");
    const readOnly = await deps.flags.isEnabled("read_only");

    let blocked: string | null = null;
    if (!last || (route !== "publish" && route !== "publish_notify") || !sameRevision)
      blocked = RULE_RATIONALE.staleDecision();
    else if (neverAuto(ctx)) blocked = RULE_RATIONALE.neverAuto();
    else if (!autoPublish || readOnly) blocked = RULE_RATIONALE.autoPublishOff();

    if (blocked) {
      await deps.repo.setStatus(articleId, { status: "in_review", reviewReason: blocked });
      await deps.repo.recordDecision({
        objectRef: msg.itemRef,
        step: "publish",
        agentId: null,
        promptVersion: null,
        rulesVersion: last?.rulesVersion ?? null,
        inputHash: inputHash("publish", ctx.version, "blocked"),
        output: { published: false, route: route ?? null, autoPublish, readOnly },
        rationale: blocked,
        recommended: "review",
      });
      return ok([nextMessage(msg, "notify", `${msg.itemRef}#review`)]);
    }

    const publishedAt = deps.now().toISOString();
    await deps.repo.setStatus(articleId, {
      status: "published",
      publishMode: "auto",
      publishedAt,
      rulesVersion: last!.rulesVersion ?? null,
      reviewReason: null,
    });
    await deps.repo.recordDecision({
      objectRef: msg.itemRef,
      step: "publish",
      agentId: null,
      promptVersion: null,
      rulesVersion: last!.rulesVersion ?? null,
      inputHash: inputHash("publish", ctx.version, "published"),
      output: {
        published: true,
        publishMode: "auto",
        publishedAt,
        route,
        rule: last!.output.rule ?? null,
        confidence: { level: ctx.confidence, score: ctx.confidenceScore },
        version: ctx.version,
      },
      rationale: last!.rationale,
      recommended: typeof route === "string" ? route : null,
    });
    const kind = route === "publish_notify" ? "auto_published_notify" : "auto_published";
    return ok([index, nextMessage(msg, "notify", `${msg.itemRef}#${kind}`)]);
  };
}
