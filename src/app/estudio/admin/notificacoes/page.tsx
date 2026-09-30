import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewPushForm } from "@/components";
import { NEW_PUSH_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { canAccess } from "@/lib/auth";
import { requireAnyRole } from "@/lib/auth/require-role";
import { pushSettings } from "@/lib/db/queries/push-admin";
import { listSectionOptions } from "@/lib/db/queries/queue";
import { PUSH_ACTIONS, pushKindsFor } from "@/lib/push/permissions";
import { PUSH_ADMIN_PATH } from "../../nav";
import { estimateAudienceAction, requestPushAction, searchArticlesAction } from "./actions";

export const metadata: Metadata = { title: "Notificações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/**
 * Aba 1 · Novo envio (spec §10.2). Quem não pede envio vai para a fila (aprovadores) ou para o
 * Funil do app (analista).
 */
export default async function PushNewPage() {
  const session = await requireAnyRole(PUSH_ACTIONS, { next: PUSH_ADMIN_PATH });
  const roles = session.roles;
  if (!canAccess(roles, "push.request")) {
    if (canAccess(roles, "push.approve") || canAccess(roles, "push.settings"))
      redirect(`${PUSH_ADMIN_PATH}/fila`);
    redirect(`${PUSH_ADMIN_PATH}/funil`);
  }
  const [sections, settings] = await Promise.all([listSectionOptions(), pushSettings()]);
  return (
    <section aria-labelledby="novo-envio" className="flex flex-col gap-6">
      <h2 id="novo-envio" className="type-section text-strong">
        {T.title}
      </h2>
      <NewPushForm
        kinds={pushKindsFor(roles)}
        sections={sections.map((s) => ({ slug: s.value, name: s.label }))}
        templates={settings.templates}
        paused={settings.paused.on}
        request={requestPushAction}
        estimate={estimateAudienceAction}
        search={searchArticlesAction}
        queueHref={`${PUSH_ADMIN_PATH}/fila`}
      />
    </section>
  );
}
