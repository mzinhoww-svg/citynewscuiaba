import type { Metadata } from "next";
import { Button, EmptyState, InlineAlert, SectionHeader, StatGrid } from "@/components";
import { PushHomeCard, QueueTable, StaffUrgentOptIn, StudioScreen } from "@/components/estudio";
import { QUEUE_TEXT as T, STUDIO_TEXT } from "@/content/pt-BR/studio";
import { canAccess } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { listQueue, newsroomKpis, type NewsroomKpis, type QueueRow } from "@/lib/db/queries/queue";
import { pushCardData, staffAlertsOn } from "@/lib/db/queries/studio-notifications";
import { hasAnyPushAction } from "@/lib/push/permissions";
import { formatDateTime } from "@/lib/format/date";
import { unpublishAutoAction } from "./actions";
import { pushHrefFor } from "./nav";
import { newsroomStats, QueueShortcuts } from "./newsroom";
import { setStaffAlertsAction } from "./notificacoes/actions";
import { tabHref, toTableRow } from "./fila/rows";

export const metadata: Metadata = { title: "Redação · Estúdio · CityNews Cuiabá" };
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
      desk
        ? listQueue({ tab: "exceptions" }, { limit: PREVIEW }).then((p) => p.rows)
        : Promise.resolve([]),
    ]);
  } catch {
    kpis = null;
  }

  // Cartão do push (descoberta do A09): só para quem tem alguma ação de push.
  const pushAccess = hasAnyPushAction(session.roles);
  let pushCard: { queued: number; pending: number; lastDelivery: string | null } | null = null;
  let urgentOn = false;
  if (pushAccess) {
    const [card, on] = await Promise.all([pushCardData(), staffAlertsOn(session.userId)]);
    if (card.ok)
      pushCard = {
        queued: card.value.queued,
        pending: card.value.pending,
        lastDelivery: card.value.lastDeliveryAt ? formatDateTime(card.value.lastDeliveryAt) : null,
      };
    urgentOn = on;
  }

  const now = new Date();
  return (
    <StudioScreen title={T.newsroomTitle}>
      {pushAccess && (
        <PushHomeCard
          data={pushCard}
          href={pushHrefFor(session.roles)}
          optIn={<StaffUrgentOptIn initialOn={urgentOn} action={setStaffAlertsAction} />}
        />
      )}
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
          <section aria-label={T.kpiRegion}>
            <StatGrid columns={5} items={newsroomStats(kpis, desk)} />
          </section>
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
              <QueueShortcuts />
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
    </StudioScreen>
  );
}
