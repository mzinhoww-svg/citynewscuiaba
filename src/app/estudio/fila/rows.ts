import "server-only";
import type { QueueTableRow } from "@/components";
import { can, type Session } from "@/lib/auth/permissions";
import type { QueueRow, QueueTab } from "@/lib/db/queries/queue";

export function tabHref(tab: QueueTab): string {
  return `/estudio/fila?aba=${tab}`;
}

/** Linha da fila para a tabela: link certo (revisão de item autônomo ou editor) e permissões. */
export function toTableRow(r: QueueRow, session: Session, now: Date): QueueTableRow {
  const isPublic = r.status === "published" || r.status === "updated";
  return {
    id: r.id,
    title: r.title,
    href: r.fromPipeline && !isPublic ? `/estudio/fila/${r.id}` : `/estudio/materias/${r.id}`,
    sectionName: r.section.name,
    status: r.status,
    publishMode: r.publishMode,
    confidence: r.confidence,
    fromPipeline: r.fromPipeline,
    aiFallback: r.aiFallback,
    sensitive: r.sensitive,
    recommended: r.recommended,
    recommendedRationale: r.recommendedRationale,
    reviewReason: isPublic ? null : r.reviewReason,
    assigneeName: r.assignee?.name ?? null,
    dueAt: r.dueAt,
    overdue:
      r.dueAt !== null &&
      !isPublic &&
      r.status !== "archived" &&
      r.status !== "unpublished" &&
      new Date(r.dueAt).getTime() < now.getTime(),
    canUnpublish:
      r.publishMode === "auto" &&
      isPublic &&
      can(session.roles, "article.unpublish_auto", {
        section: r.section.slug,
        userId: session.userId,
      }),
  };
}
