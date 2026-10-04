import "server-only";
import { redirect } from "next/navigation";
import { can, loginRedirect, type Session } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { GUIDE_SECTION } from "@/lib/studio/guide-scope";

/**
 * Entrada no admin do Guia: `site.manage` (admin e editor-chefe) ou `article.edit` na editoria
 * Guia Cuiabá (editor da editoria). Jornalista e demais papéis voltam para a entrada com o aviso
 * de falta de permissão; sem sessão, para o login.
 */
export async function guideSession(next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginRedirect(next));
  const ok =
    can(session.roles, "site.manage") ||
    can(session.roles, "article.edit", { section: GUIDE_SECTION });
  if (!ok) redirect(loginRedirect(next, session.expired ? "sessao-expirada" : "sem-permissao"));
  return session;
}
