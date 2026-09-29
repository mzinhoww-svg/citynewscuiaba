import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StudioShell } from "@/components";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { canAccess, loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { pendingCount } from "@/lib/db/queries/push-admin";
import { studioNav } from "./nav";

/* Sessão por requisição: nunca pré-renderizar nem cachear o Estúdio. */
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect(loginRedirect("/estudio"));
  if (session.roles.length === 0) redirect(loginRedirect("/estudio", "sem-permissao"));

  // "Notificações (n)" para quem aprova pedidos de push (G10); a contagem nunca derruba a casca.
  const pendingPush = canAccess(session.roles, "push.approve") ? await pendingCount() : 0;
  const role = [...new Set(session.roles.map((r) => ROLE_LABEL[r.role]))].join(" · ");
  return (
    <StudioShell
      nav={studioNav(session.roles, { pendingPush })}
      user={{ name: session.email ?? role, role }}
    >
      {children}
    </StudioShell>
  );
}
