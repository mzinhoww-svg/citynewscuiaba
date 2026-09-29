import type { Metadata } from "next";
import { AdminNotice, Button, EmptyState, NotifyPanel } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { paramsOf, requireArea } from "@/lib/admin/guard";
import {
  actorNames,
  countQueuedEmails,
  listPushApprovals,
  listPushCandidates,
  listPushDispatches,
} from "@/lib/db/queries/admin";
import { requestPushApprovalAction, sendUrgentPushAction } from "./actions";

export const metadata: Metadata = { title: "Notificações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/notificacoes";

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireArea("notificacoes", NEXT);
  const flash = paramsOf(await searchParams);

  let data: {
    candidates: Awaited<ReturnType<typeof listPushCandidates>>;
    approvals: Awaited<ReturnType<typeof listPushApprovals>>;
    history: Awaited<ReturnType<typeof listPushDispatches>>;
    titles: Map<string, string>;
    names: Map<string, string>;
    queued: number;
  } | null = null;
  try {
    const [candidates, approvals, history, queued] = await Promise.all([
      listPushCandidates(),
      listPushApprovals(new Date()),
      listPushDispatches(),
      countQueuedEmails(),
    ]);
    const titles = new Map(candidates.map((c) => [c.id, c.title]));
    for (const h of history) if (h.title) titles.set(h.articleId, h.title);
    const names = await actorNames([
      ...approvals.flatMap((a) => [a.requestedBy, a.approvedBy ?? ""]),
      ...history.map((h) => h.sentBy),
    ]);
    data = { candidates, approvals, history, titles, names, queued };
  } catch (e) {
    console.error("estudio notificacoes:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.notify.title}</h1>
        <p className="type-body text-meta">{T.notify.intro}</p>
      </header>
      <AdminNotice ok={flash.ok} erro={flash.erro} />
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.common.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.common.retry}
            </Button>
          }
        >
          {T.common.errorBody}
        </EmptyState>
      ) : (
        <NotifyPanel
          candidates={data.candidates}
          approvals={data.approvals}
          history={data.history}
          titles={data.titles}
          names={data.names}
          queuedEmails={data.queued}
          requestAction={requestPushApprovalAction}
          sendAction={sendUrgentPushAction}
        />
      )}
    </section>
  );
}
