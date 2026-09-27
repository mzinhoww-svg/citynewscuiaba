import { NextResponse, type NextRequest } from "next/server";
import { createGoneChecker, goneSlugFromPath, supabaseGoneLookup } from "@/lib/http/gone";

let isGone: ((slug: string) => Promise<boolean>) | null | undefined;

/** Sem variáveis do Supabase não há o que consultar: a página cuida do estado. */
function goneChecker() {
  if (isGone !== undefined) return isGone;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  isGone = url && key ? createGoneChecker(supabaseGoneLookup(url, key)) : null;
  return isGone;
}

/**
 * Proxy do portal. Matéria arquivada ou despublicada responde 410 (Review Focus 2): a página
 * renderiza o motivo e aqui só trocamos o status, que o App Router não permite na página.
 */
export async function proxy(req: NextRequest) {
  const slug = goneSlugFromPath(req.nextUrl.pathname);
  const check = slug ? goneChecker() : null;
  if (slug && check && (await check(slug))) {
    return NextResponse.next({ status: 410 });
  }
  return NextResponse.next();
}

export const config = { matcher: ["/materia/:slug"] };
