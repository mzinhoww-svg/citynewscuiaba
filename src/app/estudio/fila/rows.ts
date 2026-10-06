import "server-only";
import type { QueueTableRow } from "@/components/estudio";
import { ARTICLE_STATUS_LABEL, CONFIDENCE_LABEL } from "@/content/pt-BR/studio";
import { can, type Session } from "@/lib/auth/permissions";
import {
  QUEUE_ORIGINS,
  QUEUE_TABS,
  type QueueFilter,
  type QueueRow,
  type QueueTab,
} from "@/lib/db/queries/queue";
import { withOrigin } from "@/lib/studio/origin";

export function tabHref(tab: QueueTab): string {
  return `/estudio/fila?aba=${tab}`;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends string>(v: string, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

export const QUEUE_STATUSES = Object.keys(
  ARTICLE_STATUS_LABEL,
) as (keyof typeof ARTICLE_STATUS_LABEL)[];
export const QUEUE_CONFIDENCES = Object.keys(CONFIDENCE_LABEL) as (keyof typeof CONFIDENCE_LABEL)[];

/** Valores dos filtros da fila como vieram na URL (para os campos e os links). */
export interface QueueFilterValues {
  estado: string;
  editoria: string;
  origem: string;
  confianca: string;
  responsavel: string;
  prazo: string;
}

/**
 * Aba e filtros da fila lidos da URL (`?aba=&estado=…`), validados. A mesma leitura serve à
 * lista e ao "Aprovar e ir para o próximo" da revisão, que relê a URL de origem (`?de=`).
 */
export function queueFilterFrom(sp: Params): {
  tab: QueueTab;
  values: QueueFilterValues;
  filter: QueueFilter;
} {
  const tab = pick(one(sp.aba), QUEUE_TABS) ?? "all";
  const values: QueueFilterValues = {
    estado: one(sp.estado),
    editoria: one(sp.editoria),
    origem: one(sp.origem),
    confianca: one(sp.confianca),
    responsavel: one(sp.responsavel),
    prazo: one(sp.prazo),
  };
  const filter: QueueFilter = {
    tab,
    status: pick(values.estado, QUEUE_STATUSES),
    section: /^[a-z-]{2,40}$/.test(values.editoria) ? values.editoria : undefined,
    origin: pick(values.origem, QUEUE_ORIGINS),
    confidence: pick(values.confianca, QUEUE_CONFIDENCES),
    assignee: values.responsavel || undefined,
    due: values.prazo === "vencido" ? "overdue" : values.prazo === "hoje" ? "today" : undefined,
  };
  return { tab, values, filter };
}

/** URL da fila com a aba e os filtros preenchidos (origem dos links para o detalhe). */
export function queueListHref(tab: QueueTab, values: QueueFilterValues): string {
  const p = new URLSearchParams({ aba: tab });
  for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);
  return `/estudio/fila?${p.toString()}`;
}

/** Aba e filtros de uma URL de origem da fila (`/estudio/fila?…`); `null` se for outra tela. */
export function queueFilterFromOrigin(origin: string): QueueFilter | null {
  const url = new URL(origin, "http://estudio.local");
  if (url.pathname !== "/estudio/fila") return null;
  const sp: Params = {};
  for (const [k, v] of url.searchParams) if (sp[k] === undefined) sp[k] = v;
  return queueFilterFrom(sp).filter;
}

/**
 * Linha da fila para a tabela: link certo (revisão de item autônomo ou editor), com a lista de
 * origem em `?de=` (aba e filtros, para o "Voltar" e o "próximo"), e permissões.
 */
export function toTableRow(
  r: QueueRow,
  session: Session,
  now: Date,
  origin?: string,
): QueueTableRow {
  const isPublic = r.status === "published" || r.status === "updated";
  const href = r.fromPipeline && !isPublic ? `/estudio/fila/${r.id}` : `/estudio/materias/${r.id}`;
  return {
    id: r.id,
    title: r.title,
    href: origin ? withOrigin(href, origin) : href,
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
