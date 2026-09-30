import "server-only";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/client";
import { DEFAULT_SESSION_HOURS, sessionExpired } from "./session-age";
import {
  loginRedirect,
  resolveAccess,
  ROLES,
  type Action,
  type Role,
  type RoleGrant,
  type Scope,
  type Session,
} from "./permissions";

const isRole = (value: string): value is Role => (ROLES as readonly string[]).includes(value);

/** Sessão validada no Supabase Auth (getUser) e papéis de `user_roles`. `null` sem login. */
export async function getSession(): Promise<Session | null> {
  const db = await createServerClient();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return null;
  const { data: rows } = await db
    .from("user_roles")
    .select("role, sections")
    .eq("user_id", data.user.id);
  const roles: RoleGrant[] = (rows ?? [])
    .filter((row) => isRole(row.role))
    .map((row) => ({ role: row.role, sections: row.sections }));
  // Duração máxima da sessão da equipe (A11): vencida, o papel sai da sessão (falha fechada).
  if (roles.length > 0) {
    const { data: hours } = await db.rpc("security_session_hours");
    const limit = typeof hours === "number" ? hours : DEFAULT_SESSION_HOURS;
    if (sessionExpired(data.user.last_sign_in_at, limit, new Date()))
      return { userId: data.user.id, email: data.user.email, roles: [], expired: true };
  }
  return { userId: data.user.id, email: data.user.email, roles };
}

/**
 * Guarda de rota e de Server Action do Estúdio.
 * - Sem sessão: redireciona para `/entrar?next=<next>`.
 * - Sem permissão: redireciona para `/entrar?next=<next>&motivo=sem-permissao` (a tela de entrar
 *   explica que a conta não tem acesso e oferece trocar de conta; não há página 403 separada).
 * Sem `scope`, checa acesso à ação em algum escopo (entrada na página); com `scope`, checa o objeto
 * (editoria, autoria) usando o usuário da sessão. `next` padrão: `/estudio`.
 */
export async function requireRole(
  action: Action,
  scope?: Omit<Scope, "userId">,
  options: { next?: string } = {},
): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginRedirect(options.next));
  const decision = resolveAccess(session, action, scope, options.next);
  if (!decision.ok) redirect(decision.redirectTo);
  return session;
}

/**
 * Guarda de página com várias portas (A09: `push.request`, `push.approve`, `push.settings` ou
 * `push.metrics`): entra quem tem qualquer uma das ações em algum escopo. Mesmos
 * redirecionamentos de `requireRole`; a checagem do objeto continua em cada Server Action.
 */
export async function requireAnyRole(
  actions: readonly Action[],
  options: { next?: string } = {},
): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginRedirect(options.next));
  const allowed = actions.some((a) => resolveAccess(session, a, undefined, options.next).ok);
  if (!allowed)
    redirect(loginRedirect(options.next, session.expired ? "sessao-expirada" : "sem-permissao"));
  return session;
}
