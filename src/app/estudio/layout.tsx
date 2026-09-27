import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { StudioShell } from "@/components";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import { loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { studioNav } from "./nav";

/* Sessão por requisição: nunca pré-renderizar nem cachear o Estúdio. */
export const dynamic = "force-dynamic";

export default async function StudioLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await getSession();
  if (!session) redirect(loginRedirect("/estudio"));
  if (session.roles.length === 0) redirect(loginRedirect("/estudio", "sem-permissao"));

  const role = [...new Set(session.roles.map((r) => ROLE_LABEL[r.role]))].join(" · ");
  return (
    <StudioShell nav={studioNav(session.roles)} user={{ name: session.email ?? role, role }}>
      {children}
    </StudioShell>
  );
}
