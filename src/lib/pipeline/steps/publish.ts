import { AUTONOMY_TEXT, RULE_RATIONALE } from "@/content/pt-BR/rules";
import { err, ok, type Result } from "@/lib/result";
import type { RuleSet } from "@/lib/rules";
import type { DecisionContext } from "../ports";
import { nextMessage, stepError, type StepHandler } from "../run-step";
import { resolveRules } from "@/lib/rules/load";
import { breakerText, check as checkBreaker } from "../breaker";
import {
  autoChecklist,
  COVER_WAIT_MS,
  endsCleanly,
  isComplete,
  MAX_REWRITES,
  type ShortReason,
} from "./auto-checklist";
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

    let loaded: Result<RuleSet, string>;
    try {
      loaded = await deps.rules.activeRules();
    } catch (e) {
      loaded = { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const { rules } = resolveRules(loaded);

    let blocked: string | null = null;
    let stale = false;
    let flagOff = false;
    if (!last || (route !== "publish" && route !== "publish_notify") || !sameRevision) {
      blocked = RULE_RATIONALE.staleDecision();
      stale = true;
    } else if (neverAuto(ctx, rules)) blocked = RULE_RATIONALE.neverAuto();
    else if (!autoPublish || readOnly) {
      blocked = RULE_RATIONALE.autoPublishOff();
      flagOff = true;
    }

    // A decisão vem antes da mudança de status: uma queda no meio nunca deixa matéria publicada
    // (ou retida) sem o registro do porquê; a nova tentativa grava de novo e muda o status.
    const hold = async (why: string, extra: Record<string, unknown>, notify = "review") => {
      await deps.repo.recordDecision({
        objectRef: msg.itemRef,
        step: "publish",
        agentId: null,
        promptVersion: null,
        rulesVersion: last?.rulesVersion ?? null,
        inputHash: inputHash("publish", ctx.version, "blocked"),
        output: { published: false, route: route ?? null, autoPublish, readOnly, ...extra },
        rationale: why,
        recommended: "review",
      });
      await deps.repo.setStatus(articleId, { status: "in_review", reviewReason: why });
      return ok([nextMessage(msg, "notify", `${msg.itemRef}#${notify}`)]);
    };
    // Sem fila humana para o que o sistema resolve (A-143): decisão desatualizada volta às regras;
    // publicação desligada e disjuntor aberto deixam rascunho com próxima ação e prazo.
    const defer = async (
      why: string,
      nextAction: "await_auto_publish" | "breaker_recovery",
      minutes: number,
      extra: Record<string, unknown>,
      notify?: string,
    ) => {
      await deps.repo.recordDecision({
        objectRef: msg.itemRef,
        step: "publish",
        agentId: null,
        promptVersion: null,
        rulesVersion: last?.rulesVersion ?? null,
        inputHash: inputHash("publish", ctx.version, "deferred", nextAction),
        output: {
          published: false,
          route: route ?? null,
          autoPublish,
          readOnly,
          nextAction,
          ...extra,
        },
        rationale: why,
        recommended: "publish",
      });
      await deps.repo.setStatus(articleId, {
        status: "draft",
        reviewReason: why,
        nextAction,
        nextAttemptAt: new Date(deps.now().getTime() + minutes * 60_000).toISOString(),
      });
      return ok(notify ? [nextMessage(msg, "notify", `${msg.itemRef}#${notify}`)] : []);
    };
    // As regras só mandam publicar com decisão da revisão atual: aqui não há laço.
    if (stale) return ok([nextMessage(msg, "rules", msg.itemRef)]);
    if (flagOff) return defer(AUTONOMY_TEXT.awaitAutoPublish(), "await_auto_publish", 30, {});
    if (blocked) return hold(blocked, {});

    // Disjuntor de volume e de erro (AUT-T4, A8): não é freio editorial, é proteção contra erro.
    if (deps.breaker) {
      const snap = await deps.breaker.counts(deps.now());
      const b = checkBreaker(deps.now(), snap.counts, snap.limits);
      if (b.open && b.reason) {
        const detail = { counts: snap.counts, limits: snap.limits };
        const first = await deps.breaker.trip(b.reason, detail);
        if (first)
          await deps.repo.audit({
            actor: "sistema",
            action: "breaker.trip",
            objectRef: msg.itemRef,
            details: { reason: b.reason, ...detail },
          });
        return defer(
          AUTONOMY_TEXT.breakerHold(breakerText(b.reason, snap.limits)),
          "breaker_recovery",
          30,
          { breaker: b.reason },
          "breaker_open",
        );
      }
    }

    // Checklist automático: conserta SEO, taxonomia e texto alternativo; só falta de fonte e de
    // título barram (A16 e AUT-T4).
    const input = await deps.repo.checkInput(articleId);
    if (!input) return err(stepError.notFound(`matéria ${articleId} não encontrada`));
    const checklist = autoChecklist(input, { tags: ctx.tags, neighborhoods: ctx.neighborhoods });
    if (checklist.blockers.includes("no_title"))
      return hold(RULE_RATIONALE.noTitle(), { blockers: checklist.blockers });
    if (checklist.blockers.includes("no_source"))
      return hold(RULE_RATIONALE.noSource(), { blockers: checklist.blockers });
    if (Object.keys(checklist.patch).length > 0)
      await deps.repo.applyChecklist(articleId, checklist.patch);

    // Portão de completude (A16 e R41): corpo no mínimo de linhas, sem parágrafo cortado, fonte e
    // capa já decididas. O que falta volta ao passo anterior; esgotado, publica o que dá.
    let shortReason: ShortReason | null = input.shortReason;
    const completeness = isComplete(input);
    if (completeness.missing.includes("body")) {
      const topicRef = ctx.topicId ? `topic:${ctx.topicId}` : null;
      const written = topicRef ? await deps.repo.latestDecision(topicRef, "summarize") : null;
      const rewrites = Number(written?.output.rewrite ?? 0);
      const insufficient = written?.output.insufficientSource === true;
      const truncated = !endsCleanly(input.body);
      const exhausted = rewrites >= MAX_REWRITES || topicRef === null;
      if (truncated && exhausted)
        return hold(RULE_RATIONALE.truncatedBody(), { missing: completeness.missing });
      if (!truncated && (insufficient || exhausted)) shortReason = "insufficient_source";
      else return ok([nextMessage(msg, "summarize", `${topicRef}#rewrite${rewrites + 1}`)]);
    }
    if (completeness.missing.includes("cover")) {
      const waiting = await deps.repo.latestDecision(msg.itemRef, "publish");
      const since =
        waiting?.output.waiting === true && waiting.output.version === ctx.version
          ? Date.parse(String(waiting.output.waitingSince))
          : Number.NaN;
      if (!Number.isFinite(since)) {
        await deps.repo.recordDecision({
          objectRef: msg.itemRef,
          step: "publish",
          agentId: null,
          promptVersion: null,
          rulesVersion: last?.rulesVersion ?? null,
          inputHash: inputHash("publish", ctx.version, "waiting"),
          output: {
            published: false,
            waiting: true,
            waitingSince: deps.now().toISOString(),
            version: ctx.version,
            missing: completeness.missing,
          },
          rationale: RULE_RATIONALE.waitingCover(),
          recommended: null,
        });
        return err(stepError.transient(RULE_RATIONALE.waitingCover()));
      }
      if (deps.now().getTime() - since < COVER_WAIT_MS)
        return err(stepError.transient(RULE_RATIONALE.waitingCover()));
      // Passou o prazo: cartão tipográfico final, nunca "imagem depois".
      await deps.repo.recordDecision({
        objectRef: msg.itemRef,
        step: "image",
        agentId: null,
        promptVersion: null,
        inputHash: inputHash("image-fallback", ctx.version),
        output: { kind: "typographic", mediaId: null, fallback: "cover_timeout" },
        rationale: "Capa não chegou em 10 minutos: cartão tipográfico da editoria (A16).",
        recommended: null,
      });
    }

    const publishedAt = deps.now().toISOString();
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
        shortReason,
        checklistFixed: checklist.fixed,
      },
      rationale: last!.rationale,
      recommended: typeof route === "string" ? route : null,
    });
    await deps.repo.setStatus(articleId, {
      status: "published",
      publishMode: "auto",
      publishedAt,
      rulesVersion: last!.rulesVersion ?? null,
      reviewReason: null,
      ...(shortReason !== input.shortReason ? { shortReason } : {}),
    });
    if (deps.afterPublish) {
      try {
        await deps.afterPublish();
      } catch {
        /* pauta quente é melhor esforço: a publicação já está gravada */
      }
    }
    const kind = route === "publish_notify" ? "auto_published_notify" : "auto_published";
    return ok([index, nextMessage(msg, "notify", `${msg.itemRef}#${kind}`)]);
  };
}
