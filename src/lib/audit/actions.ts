import { ACTIONS } from "@/lib/auth/permissions";

/**
 * Ações do Painel de Fontes: triggers `audit_source_changes` e `app_setting_set` (migration 0011)
 * e as Server Actions de `src/app/estudio/control/fontes/actions.ts`.
 */
export const SOURCE_ADMIN_AUDIT_ACTIONS = [
  "source.create",
  "source.update",
  "source.status",
  "source.archive",
  "source.restore",
  "source.analyze",
  "source.test",
  "source.collect_now",
  "source.takedown_failed",
  "source.approval_requested",
  "source.approval_rejected",
  "source.approval_applied",
  "settings.update",
] as const;

/**
 * Nomes que o Estúdio grava no audit_log (sufixo `.denied` opcional). O banco aceita só esta
 * lista (`studio_audit_actions()`, migrations 0025/0026/0033/0034); o teste de integração confere as
 * duas nos dois sentidos.
 */
export const AUDIT_ACTIONS = [
  ...ACTIONS,
  ...SOURCE_ADMIN_AUDIT_ACTIONS,
  "article.assign",
  "article.reject",
  "article.reprocess",
  "article.request_changes",
  "article.request_review",
  "article.save",
  "article.sources",
  "article.suggestion.accept",
  "article.suggestion.reject",
  "article.update",
  "correction.open",
  "correction.publish",
  "event.approve",
  "event.reject",
  "media.block",
  "media.generate",
  "media.license.block",
  "media.license.renew",
  "media.replace",
  "media.takedown.request",
  "report.respond",
  "media.image_text",
  "pipeline.run_now",
  "pipeline.reprocess",
  "pipeline.quarantine.discard",
  "logs.export",
  "ai.eval.run",
  "ai.eval.case",
  // Aprovações (P5-T1, 0029)
  "approval.requested",
  "approval.approved",
  "approval.rejected",
  "approval.applied",
  // Contingência (P5-T10, 0035)
  "flag.set",
  "rules.rollback",
  // Agentes, modelos, prompts e playground (P5-T5, 0036)
  "prompt.create",
  "prompt.request",
  "prompt.rollback",
  "ai.playground.run",
  "ai.agent.update",
  "ai.model.update",
  // Recomendação (P5-T7, 0037)
  "rec.weights.activate",
  "rec.campaign.create",
  "rec.experiment.create",
  "rec.experiment.end",
  "rec.experiment.promote",
  "rec.explain",
  // Administração (P5-T8, 0038)
  "user.invite",
  "user.role.grant",
  "user.role.revoke",
  "team.save",
  "team.delete",
  "taxonomy.save",
  "taxonomy.merge",
  "home.save",
  "home.publish",
  // Administração (P5-T9, 0039)
  "ads.campaign.save",
  "ads.campaign.delete",
  "seo.redirect.save",
  "seo.redirect.delete",
  "audit.export",
  "privacy.request.save",
  "security.key.rotate",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
