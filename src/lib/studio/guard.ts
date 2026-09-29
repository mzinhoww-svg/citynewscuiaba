import "server-only";
import { redirect } from "next/navigation";
import { loginRedirect, resolveAccess, type Action, type Session } from "@/lib/auth/permissions";
import { studioContext, type StudioContext } from "./context";

/**
 * Guarda de Server Action do Estúdio sobre o contexto atual (`studioContext`): mesma decisão de
 * `requireRole` (sem sessão → `/entrar?next=`; sem papel → `/entrar?next=&motivo=sem-permissao`),
 * mas lendo a sessão do contexto, que nos testes de integração é a de um usuário de seed.
 */
export async function requireStudioRole(
  action: Action,
  options: { next?: string } = {},
): Promise<{ ctx: StudioContext; session: Session }> {
  const ctx = await studioContext();
  const decision = resolveAccess(ctx.session, action, undefined, options.next);
  if (!decision.ok || !ctx.session)
    redirect(decision.ok ? loginRedirect(options.next) : decision.redirectTo);
  return { ctx, session: ctx.session };
}
