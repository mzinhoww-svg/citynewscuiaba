import { can, type RoleGrant } from "@/lib/auth/permissions";
import { err, ok, type Result } from "@/lib/result";
import type { PublishRepo, Revalidate } from "./ports";
import { articleTags } from "./steps/publish";
import { inputHash } from "./steps/understanding";

export type UnpublishError =
  "reason_required" | "not_found" | "forbidden" | "not_auto" | "not_published";

export interface UnpublishDeps {
  repo: PublishRepo;
  revalidate: Revalidate;
  now: () => Date;
}

/**
 * Desfaz uma publicação automática em um clique (`article.unpublish_auto`: editor-chefe em tudo,
 * editor na editoria). Exige motivo; grava a decisão humana ao lado da automática, audita e
 * invalida o cache. A tela é do P4; esta função é o contrato.
 */
export async function unpublishAuto(
  deps: UnpublishDeps,
  articleId: string,
  actor: { id: string; roles: RoleGrant[] },
  reason: string,
): Promise<Result<{ articleId: string; status: "unpublished" }, UnpublishError>> {
  const why = reason.trim();
  if (!why) return err("reason_required");
  const a = await deps.repo.decisionContext(articleId);
  if (!a) return err("not_found");
  if (!can(actor.roles, "article.unpublish_auto", { section: a.sectionSlug }))
    return err("forbidden");
  if (a.publishMode !== "auto") return err("not_auto");
  if (a.status !== "published" && a.status !== "updated") return err("not_published");

  const objectRef = `article:${articleId}`;
  const last = await deps.repo.latestDecision(objectRef, "publish");
  await deps.repo.setStatus(articleId, { status: "unpublished", reviewReason: why });
  await deps.repo.recordDecision({
    objectRef,
    step: "publish",
    agentId: null,
    promptVersion: null,
    rulesVersion: last?.rulesVersion ?? null,
    inputHash: inputHash("unpublish", articleId, deps.now().toISOString()),
    output: { action: "unpublish_auto", previous: last?.output ?? null },
    rationale: why,
    recommended: null,
    humanDecision: "unpublish",
    humanId: actor.id,
  });
  await deps.repo.audit({
    actor: actor.id,
    action: "article.unpublish_auto",
    objectRef,
    details: { reason: why, rulesVersion: last?.rulesVersion ?? null },
  });
  await deps.revalidate(articleTags(a));
  return ok({ articleId, status: "unpublished" });
}
