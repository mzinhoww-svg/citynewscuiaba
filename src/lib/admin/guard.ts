import "server-only";
import { redirect } from "next/navigation";
import { canAccessArea, type AdminArea } from "@/lib/admin/access";
import { loginRedirect, type Session } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { readOnlyNotice } from "@/lib/flags";
import { studioContext } from "@/lib/studio/context";

/** Guarda por página (sem `admin/layout.tsx`): sem sessão vai para o login; sem papel, "sem permissão". */
export async function requireArea(area: AdminArea, next: string): Promise<Session> {
  const session = await getSession();
  if (!session) redirect(loginRedirect(next));
  if (!canAccessArea(session.roles, area)) redirect(loginRedirect(next, "sem-permissao"));
  return session;
}

/** Guarda de Server Action (contexto do Estúdio, que nos testes pode ser explícito). */
export async function requireAreaInAction(
  area: AdminArea,
  next: string,
  options: { allowReadOnly?: boolean } = {},
): Promise<Session> {
  const { session } = await studioContext();
  if (!session) redirect(loginRedirect(next));
  if (!canAccessArea(session.roles, area)) redirect(loginRedirect(next, "sem-permissao"));
  // Modo leitura: nenhuma escrita da Administração (a tela de contingência é a exceção).
  if (!options.allowReadOnly && (await readOnlyNotice())) flash(next, "erro", "read_only");
  return session;
}

/** Volta para a tela com o resultado no endereço (`?ok=` ou `?erro=`). */
export function flash(
  base: string,
  kind: "ok" | "erro",
  code: string,
  extra: Record<string, string> = {},
): never {
  const q = new URLSearchParams({ [kind]: code, ...extra });
  redirect(`${base}?${q.toString()}`);
}

type Params = Record<string, string | string[] | undefined>;
export const one = (v: string | string[] | undefined): string | undefined =>
  (Array.isArray(v) ? v[0] : v)?.slice(0, 200) || undefined;
export const paramsOf = (sp: Params) => ({
  ok: one(sp.ok),
  erro: one(sp.erro),
  campo: one(sp.campo),
});
