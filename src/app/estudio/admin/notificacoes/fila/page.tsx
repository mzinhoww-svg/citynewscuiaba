import type { Metadata } from "next";
import { Button, EmptyState, PushQueueTable } from "@/components";
import { PUSH_QUEUE_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { canAccess } from "@/lib/auth";
import { requireAnyRole } from "@/lib/auth/require-role";
import { queueRows } from "@/lib/db/queries/push-admin";
import { PUSH_ADMIN_PATH } from "../../../nav";
import { cancelPushAction, decidePushAction } from "../actions";

export const metadata: Metadata = { title: "Fila de notificações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** Aba 2 · Fila e aprovações (spec §10.3). Quem pede, aprova ou configura. */
export default async function PushQueuePage() {
  const session = await requireAnyRole(["push.request", "push.approve", "push.settings"], {
    next: `${PUSH_ADMIN_PATH}/fila`,
  });
  const r = await queueRows();
  if (!r.ok)
    return (
      <EmptyState
        tone="error"
        title="Não foi possível carregar a fila"
        actions={<Button href={`${PUSH_ADMIN_PATH}/fila`}>Tentar de novo</Button>}
      />
    );
  return (
    <section aria-labelledby="fila-push" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="fila-push" className="type-section text-strong">
          {T.title}
        </h2>
        <p className="type-body text-meta">{T.intro}</p>
      </div>
      <PushQueueTable
        rows={r.value}
        currentUserId={session.userId}
        canApprove={canAccess(session.roles, "push.approve")}
        canSettings={canAccess(session.roles, "push.settings")}
        decide={decidePushAction}
        cancel={cancelPushAction}
      />
    </section>
  );
}
