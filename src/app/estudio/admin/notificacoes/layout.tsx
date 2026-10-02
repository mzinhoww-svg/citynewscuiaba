import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components";
import { PushBanners, PushTabsNav, type PushTabKey } from "@/components/estudio";
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h1 className="type-screen-title text-strong">{T.title}</h1>
            <p className="max-w-read type-body text-meta">{T.intro}</p>
          </div>
          {canAccess(roles, "push.metrics") && (
            <Link
              href={`${PUSH_ADMIN_PATH}/funil`}
              className="inline-flex min-h-tap items-center gap-1.5 text-16 font-medium text-link underline-offset-4 hover:underline"
            >
              <Icon name="chart-column" size={18} />
              {T.funnelLink}
            </Link>
          )}
        </div>
        <PushBanners
          paused={settings.paused}
          pending={pending}
          vapidMissing={settings.vapid.missing}
          showVapid={canAccess(roles, "push.settings")}
        />
      </header>
      {tabs.length > 0 && <PushTabsNav tabs={tabs} />}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
