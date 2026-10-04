import type { Metadata } from "next";
import { EmptyState, Button, LoadMore, loadMoreAnchor } from "@/components";
import { QueueFilters, QueueTable, QueueTabs } from "@/components/estudio";
import { ARTICLE_STATUS_LABEL, CONFIDENCE_LABEL, QUEUE_TEXT as T } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import {
  listAssignees,
  listQueue,
  listQueueThrough,
  listReviewable,
  listSectionOptions,
  QUEUE_TABS,
  queueTabCounts,
  type QueueRow,
  type QueueTab,
} from "@/lib/db/queries/queue";
import {
  approveRecommendedAction,
  assignAction,
  forcedPublishStatusAction,
  forcePublishAction,
  previewForcedPublishAction,
  requestReviewAction,
  unpublishAutoAction,
  unpublishManyAction,
} from "../actions";
import {
  QUEUE_CONFIDENCES as CONFIDENCES,
  QUEUE_STATUSES as STATUSES,
  queueFilterFrom,
  queueListHref,
  tabHref,
  toTableRow,
} from "./rows";

export const metadata: Metadata = { title: "Fila de matérias · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function QueuePage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("article.edit", undefined, { next: "/estudio/fila" });
  const sp = await searchParams;
  const { tab, values, filter } = queueFilterFrom(sp);
  // Lista de origem dos links para o detalhe (`?de=`): "Voltar" e "próximo" mantêm aba e filtros.
  const origin = queueListHref(tab, values);

  // "Carregar mais": o cursor marca o último item já mostrado; a página mostra tudo até ele e
  // a próxima página, com o foco no primeiro item novo (#mais-<n>).
  const cursor = /^[A-Za-z0-9_-]{1,512}$/.test(one(sp.cursor)) ? one(sp.cursor) : undefined;
  // Contagem por aba (item 51), em paralelo com a fila; falha deixa as abas sem número.
  const tabCountsP = queueTabCounts().catch((): Partial<Record<QueueTab, number>> => ({}));
  let rows: QueueRow[] | null = null;
  let firstNew = -1;
  let total = 0;
  let nextCursor: string | null = null;
  let reviewTotal = 0;
  let sections: { value: string; label: string }[] = [];
  let people: { id: string; name: string }[] = [];
  try {
    let review: { total: number };
    let page: { rows: QueueRow[]; total: number; nextCursor: string | null };
    let head: QueueRow[];
    [page, head, sections, people, review] = await Promise.all([
      listQueue(filter, { cursor }),
      cursor ? listQueueThrough(filter, cursor) : Promise.resolve([]),
      listSectionOptions(),
      listAssignees(),
      listReviewable(filter, 1),
    ]);
    rows = [...head, ...page.rows];
    firstNew = head.length > 0 && page.rows.length > 0 ? head.length : -1;
    total = page.total;
    nextCursor = page.nextCursor;
    reviewTotal = review.total;
  } catch {
    rows = null;
  }

  const moreHref = (next: string, shown: number) => {
    const p = new URLSearchParams({ aba: tab });
    for (const [k, v] of Object.entries(values)) if (v) p.set(k, v);
    p.set("cursor", next);
    return `/estudio/fila?${p.toString()}#${loadMoreAnchor(shown)}`;
  };

  // Mesmas abas e filtros da tela, para "Selecionar todas as N em revisão" (todas as páginas).
  const forceFilter: Record<string, string> = { tab };
  for (const [k, v] of Object.entries({
    section: filter.section,
    status: filter.status,
    confidence: filter.confidence,
    assignee: filter.assignee,
    origin: filter.origin,
    due: filter.due,
  }))
    if (v) forceFilter[k] = v;

  const tabCounts = await tabCountsP;
  const now = new Date();
  const manageDesk = canAccess(session.roles, "article.publish");
  const canUnpublishAny = canAccess(session.roles, "article.unpublish_auto");

  return (
    <section className="flex flex-col gap-6">
      <h1 className="type-screen-title text-strong">{T.queueTitle}</h1>
      <QueueTabs
        label={T.tabsLabel}
        current={tab}
        items={QUEUE_TABS.map((k) => ({
          key: k,
          label: T.tabs[k],
          href: tabHref(k),
          count: tabCounts[k],
        }))}
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
        <>
          <QueueTable
            empty={
              <EmptyState title={T.emptyTitle} icon="check">
                {T.empty[tab]}
              </EmptyState>
            }
            rows={rows.map((r, i) => ({
              ...toTableRow(r, session, now, origin),
              anchorId: i === firstNew ? loadMoreAnchor(i) : undefined,
            }))}
            unpublish={canUnpublishAny ? unpublishAutoAction : undefined}
            bulk={
              manageDesk
                ? {
                    assignees: people,
                    assign: assignAction,
                    requestReview: requestReviewAction,
                    unpublishMany: canUnpublishAny ? unpublishManyAction : undefined,
                    approveRecommended: approveRecommendedAction,
                    forcePublish: {
                      reviewTotal,
                      filter: forceFilter,
                      api: {
                        preview: previewForcedPublishAction,
                        start: forcePublishAction,
                        status: forcedPublishStatusAction,
                      },
                    },
                  }
                : undefined
            }
          />
          {rows.length > 0 && (
            <LoadMore
              href={nextCursor ? moreHref(nextCursor, rows.length) : null}
              shown={rows.length}
              total={total}
              label={T.loadMore}
            />
          )}
        </>
      )}
    </section>
  );
}
