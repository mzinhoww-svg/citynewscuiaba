import type { Metadata } from "next";
import {
  Button,
  EmptyState,
  InlineAlert,
  KpiStrip,
  QueueTable,
  QueueTabs,
  SectionHeader,
} from "@/components";
import { QUEUE_TEXT as T, STUDIO_TEXT } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import {
  listQueue,
  newsroomKpis,
  QUEUE_TABS,
  type NewsroomKpis,
  type QueueRow,
} from "@/lib/db/queries/queue";
import { unpublishAutoAction } from "./actions";
import { tabHref, toTableRow } from "./fila/rows";

export const metadata: Metadata = { title: "Newsroom · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PREVIEW = 8;

/** Newsroom (E01): KPIs do dia, aviso sobre automáticas, abas e a fila de exceção. */
export default async function StudioHomePage() {
  const session = await getSession();
  if (!session) return null;
  const desk = canAccess(session.roles, "article.edit");

  let kpis: NewsroomKpis | null = null;
  let rows: QueueRow[] = [];
  try {
    [kpis, rows] = await Promise.all([
      newsroomKpis(),
      desk ? listQueue({ tab: "exceptions", limit: PREVIEW }) : Promise.resolve([]),
    ]);
  } catch {
    kpis = null;
  }

  const now = new Date();
  return (
    <section className="flex flex-col gap-6">
      <h1 className="type-screen-title text-strong">{T.newsroomTitle}</h1>
      {kpis === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <>
          <KpiStrip
            label={T.kpiRegion}
            items={[
              { label: T.kpi.publishedToday, value: kpis.publishedToday, icon: "newspaper" },
              {
                label: T.kpi.auto24h,
                value: kpis.auto24h,
                icon: "refresh-cw",
                href: desk ? tabHref("auto24h") : undefined,
              },
              {
                label: T.kpi.exceptions,
                value: kpis.exceptions,
                icon: "layers",
                href: desk ? tabHref("exceptions") : undefined,
              },
              {
                label: T.kpi.overdue,
                value: kpis.overdue,
                icon: "clock",
                attention: kpis.overdue > 0,
                href: desk ? "/estudio/fila?prazo=vencido" : undefined,
              },
              { label: T.kpi.scheduled, value: kpis.scheduled, icon: "calendar" },
            ]}
          />
          {kpis.auto24h > 0 && (
            <InlineAlert
              tone="info"
              role="none"
              action={
                desk ? (
                  <Button href={tabHref("auto24h")} size="sm" variant="outline">
                    {T.autoBannerLink}
                  </Button>
                ) : undefined
              }
            >
              {T.autoBanner(kpis.auto24h)}
            </InlineAlert>
          )}
          {desk ? (
            <>
              <QueueTabs
                label={T.tabsLabel}
                current="exceptions"
                items={QUEUE_TABS.map((k) => ({ key: k, label: T.tabs[k], href: tabHref(k) }))}
              />
              <SectionHeader title={T.tabs.exceptions} as="h2" />
              <QueueTable
                rows={rows.map((r) => toTableRow(r, session, now))}
                unpublish={
                  canAccess(session.roles, "article.unpublish_auto")
                    ? unpublishAutoAction
                    : undefined
                }
                empty={
                  <EmptyState title={T.emptyTitle} icon="check">
                    {T.empty.exceptions}
                  </EmptyState>
                }
              />
              <div>
                <Button href={tabHref("all")} size="md" variant="text" iconRight="chevron-right">
                  {T.seeAll}
                </Button>
              </div>
            </>
          ) : (
            <p className="max-w-read type-body text-meta">{STUDIO_TEXT.intro}</p>
          )}
        </>
      )}
    </section>
  );
}
