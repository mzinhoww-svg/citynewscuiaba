import { ACTIONS } from "@/lib/auth/permissions";

/**
 * Nomes que o Estúdio grava no audit_log (sufixo `.denied` opcional). O banco aceita só esta
 * lista (`studio_audit_actions()`, migration 0025); o teste de integração confere as duas.
 */
export const AUDIT_ACTIONS = [
  ...ACTIONS,
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
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];
