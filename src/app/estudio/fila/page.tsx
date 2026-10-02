import type { Metadata } from "next";
import { EmptyState, Button } from "@/components";
import { QueueFilters, QueueTable, QueueTabs } from "@/components/estudio";
import { ARTICLE_STATUS_LABEL, CONFIDENCE_LABEL, QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import {
  listAssignees,
  listQueue,
  listSectionOptions,
  QUEUE_ORIGINS,
  QUEUE_TABS,
  type QueueFilter,
  type QueueRow,
} from "@/lib/db/queries/queue";
import {
  assignAction,
  requestReviewAction,
  unpublishAutoAction,
  unpublishManyAction,
} from "../actions";
import { tabHref, toTableRow } from "./rows";

export const metadata: Metadata = { title: "Fila de matérias · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const pick = <T extends string>(v: string, allowed: readonly T[]): T | undefined =>
  (allowed as readonly string[]).includes(v) ? (v as T) : undefined;

const STATUSES = Object.keys(ARTICLE_STATUS_LABEL) as (keyof typeof ARTICLE_STATUS_LABEL)[];
const CONFIDENCES = Object.keys(CONFIDENCE_LABEL) as (keyof typeof CONFIDENCE_LABEL)[];

export default async function QueuePage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("article.edit", undefined, { next: "/estudio/fila" });
  const sp = await searchParams;
  const tab = pick(one(sp.aba), QUEUE_TABS) ?? "all";
  const values = {
    estado: one(sp.estado),
    editoria: one(sp.editoria),
    origem: one(sp.origem),
    confianca: one(sp.confianca),
    responsavel: one(sp.responsavel),
    prazo: one(sp.prazo),
  };
  const filter: QueueFilter = {
    tab,
    status: pick(values.estado, STATUSES),
    section: /^[a-z-]{2,40}$/.test(values.editoria) ? values.editoria : undefined,
    origin: pick(values.origem, QUEUE_ORIGINS),
    confidence: pick(values.confianca, CONFIDENCES),
    assignee: values.responsavel || undefined,
    due: values.prazo === "vencido" ? "overdue" : values.prazo === "hoje" ? "today" : undefined,
  };

  let rows: QueueRow[] | null = null;
  let sections: { value: string; label: string }[] = [];
  let people: { id: string; name: string }[] = [];
  try {
    [rows, sections, people] = await Promise.all([
      listQueue(filter),
      listSectionOptions(),
      listAssignees(),
    ]);
  } catch {
    rows = null;
  }

  const now = new Date();
  const manageDesk = canAccess(session.roles, "article.publish");
  const canUnpublishAny = canAccess(session.roles, "article.unpublish_auto");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="type-screen-title text-strong">{T.queueTitle}</h1>
      <QueueTabs
        label={T.tabsLabel}
        current={tab}
        items={QUEUE_TABS.map((k) => ({ key: k, label: T.tabs[k], href: tabHref(k) }))}
      />
      <QueueFilters
        action="/estudio/fila"
        tab={tab}
        values={values}
        options={{
          status: STATUSES.map((s) => ({ value: s, label: ARTICLE_STATUS_LABEL[s] })),
          section: sections,
          origin: [
            { value: "original", label: T.filter.original },
            { value: "pipeline", label: T.filter.pipeline },
            { value: "auto", label: T.filter.auto },
          ],
          confidence: CONFIDENCES.map((c) => ({ value: c, label: CONFIDENCE_LABEL[c] })),
          assignee: [
            { value: "me", label: T.filter.me },
            { value: "none", label: T.filter.none },
            ...people.map((p) => ({ value: p.id, label: p.name })),
          ],
          due: [
            { value: "vencido", label: T.filter.overdue },
            { value: "hoje", label: T.filter.today },
          ],
        }}
      />
      {rows === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={`/estudio/fila?aba=${tab}`} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <QueueTable
          empty={
            <EmptyState title={T.emptyTitle} icon="check">
              {T.empty[tab]}
            </EmptyState>
          }
          rows={rows.map((r) => toTableRow(r, session, now))}
          unpublish={canUnpublishAny ? unpublishAutoAction : undefined}
          bulk={
            manageDesk
              ? {
                  assignees: people,
                  assign: assignAction,
                  requestReview: requestReviewAction,
                  unpublishMany: canUnpublishAny ? unpublishManyAction : undefined,
                }
              : undefined
          }
        />
      )}
    </section>
  );
}
