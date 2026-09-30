import type { Metadata } from "next";
import { PushSettingsForm } from "@/components";
import { PUSH_SETTINGS_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { pendingResume, pushSettings } from "@/lib/db/queries/push-admin";
import { PUSH_ADMIN_PATH } from "../../../nav";
import {
  approveResumeAction,
  pausePushAction,
  requestResumeAction,
  saveSettingsAction,
} from "../actions";

export const metadata: Metadata = {
  title: "Configurações de notificações · Estúdio · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** Aba 4 · Configurações (spec §10.5): só `push.settings`; sem ela, `/entrar?…&motivo=sem-permissao`. */
export default async function PushSettingsPage() {
  const session = await requireRole("push.settings", undefined, {
    next: `${PUSH_ADMIN_PATH}/configuracoes`,
  });
  const [settings, resume] = await Promise.all([pushSettings(), pendingResume()]);
  return (
    <section aria-labelledby="configuracoes-push" className="flex flex-col gap-6">
      <h2 id="configuracoes-push" className="type-section text-strong">
        {T.title}
      </h2>
      <PushSettingsForm
        settings={settings}
        pendingResume={settings.paused.on ? resume : null}
        currentUserId={session.userId}
        canApprove={canAccess(session.roles, "push.approve")}
        actions={{
          save: saveSettingsAction,
          pause: pausePushAction,
          requestResume: requestResumeAction,
          approveResume: approveResumeAction,
        }}
      />
    </section>
  );
}
