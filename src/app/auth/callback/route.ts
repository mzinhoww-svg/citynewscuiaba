import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/account";
import { afterLogin, type LoginMethod } from "@/lib/auth/links";
import { readerClient } from "@/lib/auth/reader";
import { ensureProfile } from "@/lib/db/account";

const METHODS: readonly LoginMethod[] = ["email", "magic_link", "google"];

/**
 * Volta dos links do Supabase Auth (PKCE): link mágico, Google, confirmação de cadastro e
 * recuperação de senha. Troca o código pela sessão (cookies) e segue:
 * - `fluxo=recuperar` → /redefinir-senha;
 * - `fluxo=cadastro` → /confirmar?estado=confirmado;
 * - demais → /entrar/migrar (C06).
 * Link vencido ou já usado → /confirmar?estado=expirado (ou /recuperar-senha?estado=expirado).
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const code = url.searchParams.get("code");
  const flow = url.searchParams.get("fluxo");
  const next = safeNext(url.searchParams.get("next"));
  const method = METHODS.find((m) => m === url.searchParams.get("metodo")) ?? "magic_link";
  const to = (path: string) => NextResponse.redirect(new URL(path, url.origin));
  const expired = () =>
    to(flow === "recuperar" ? "/recuperar-senha?estado=expirado" : "/confirmar?estado=expirado");

  if (!code) return expired();
  const db = await readerClient();
  if (!db) return to("/entrar?erro=servico");
  const { data, error } = await db.auth.exchangeCodeForSession(code);
  if (error || !data.user) return expired();
  await ensureProfile(db, data.user);

  if (flow === "recuperar") return to("/redefinir-senha");
  if (flow === "cadastro")
    return to(`/confirmar?${new URLSearchParams({ estado: "confirmado", next })}`);
  return to(afterLogin(next, method));
}
