import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { ToastProvider } from "@/components";
import { NotificationBell, StudioShell } from "@/components/estudio";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { canAccess, loginRedirect } from "@/lib/auth";
import { hasAnyPushAction } from "@/lib/push/permissions";
import { getSession } from "@/lib/auth/require-role";
import { pendingCount } from "@/lib/db/queries/push-admin";
import { studioCounts } from "@/lib/db/queries/studio-counts";
import { pushHrefFor, studioNav } from "./nav";

/* Sessão por requisição: nunca pré-renderizar nem cachear o Estúdio. */
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect(loginRedirect("/estudio"));
  if (session.roles.length === 0)
    redirect(loginRedirect("/estudio", session.expired ? "sessao-expirada" : "sem-permissao"));

  // "Notificações (n)" para quem aprova pedidos de push (G10); a contagem nunca derruba a casca.
  // Pendências do menu (item 51): exceções, denúncias vencidas, aprovações, falhas e mídia.
  const [pendingPush, counts] = await Promise.all([
    canAccess(session.roles, "push.approve") ? pendingCount() : Promise.resolve(0),
    studioCounts(session.roles),
  ]);
  const role = [...new Set(session.roles.map((r) => ROLE_LABEL[r.role]))].join(" · ");
  return (
    <ToastProvider>
      <StudioShell
        nav={studioNav(session.roles, { pendingPush, counts })}
        user={{ name: session.email ?? role, role }}
        bell={
          <NotificationBell
            pushHref={hasAnyPushAction(session.roles) ? pushHrefFor(session.roles) : null}
          />
        }
      >
        {children}
      </StudioShell>
    </ToastProvider>
  );
}
