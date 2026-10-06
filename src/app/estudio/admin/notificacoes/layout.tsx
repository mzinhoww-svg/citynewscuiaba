import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components";
import { PushBanners, PushTabsNav, StudioScreen, type PushTabKey } from "@/components/estudio";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { PUSH_ADMIN_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { canAccess, type RoleGrant } from "@/lib/auth";
import { requireAnyRole } from "@/lib/auth/require-role";
import { pendingCount, pushSettings } from "@/lib/db/queries/push-admin";
import { PUSH_ACTIONS } from "@/lib/push/permissions";
import { PUSH_ADMIN_PATH } from "../../nav";

/* Sessão e papel por requisição: nunca pré-renderizar nem cachear A09. */
export const dynamic = "force-dynamic";

/** Abas visíveis conforme as ações (spec §10.1; D-P23). */
export function pushTabsFor(roles: RoleGrant[]): PushTabKey[] {
  const tabs: PushTabKey[] = [];
  const request = canAccess(roles, "push.request");
  const manage = canAccess(roles, "push.approve") || canAccess(roles, "push.settings");
  if (request) tabs.push("new");
  if (request || manage) tabs.push("queue", "history");
  if (canAccess(roles, "push.settings")) tabs.push("settings");
  return tabs;
}

/**
 * A09 · Notificações: guarda com qualquer ação de push, cabeçalho, faixas (pausa, pendentes,
 * VAPID), abas como subrotas (`aria-current="page"`) e link "Funil do app" só com `push.metrics`.
 * Cada aba tem a própria fronteira de erro; cada Server Action repete a checagem.
 */
export default async function PushAdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await requireAnyRole(PUSH_ACTIONS, { next: PUSH_ADMIN_PATH });
  const roles = session.roles;
  const tabs = pushTabsFor(roles);
  const [settings, pending] = await Promise.all([
    pushSettings(),
    canAccess(roles, "push.approve") ? pendingCount() : Promise.resolve(0),
  ]);

  return (
    <StudioScreen
      section={ADMIN_TEXT.sectionLabel}
      title={T.title}
      intro={T.intro}
      actions={
        canAccess(roles, "push.metrics") ? (
          <Link
            href={`${PUSH_ADMIN_PATH}/funil`}
            className="inline-flex min-h-tap items-center gap-1.5 text-16 font-medium text-link underline-offset-4 hover:underline"
          >
            <Icon name="chart-column" size={18} />
            {T.funnelLink}
          </Link>
        ) : undefined
      }
    >
      <PushBanners
        paused={settings.paused}
        pending={pending}
        vapidMissing={settings.vapid.missing}
        showVapid={canAccess(roles, "push.settings")}
      />
      {tabs.length > 0 && <PushTabsNav tabs={tabs} />}
      <div className="min-w-0">{children}</div>
    </StudioScreen>
  );
}
