import { NextResponse, type NextRequest } from "next/server";
import { createGoneChecker, goneSlugFromPath, supabaseGoneLookup } from "@/lib/http/gone";
import { buildCsp } from "@/lib/security/headers";
import { OFFLINE_MARKER_HEADER } from "@/sw/contract";
import { routeKind } from "@/sw/core";
import { SW_SECTIONS } from "@/sw/sections";

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
 * Marcador positivo de cache offline (spec 2026-09-28 §8.2, decisão G2/A-071): só rota da
 * allowlist do SW e sem cookie de sessão do Supabase (`sb-*-auth-token*`). Todas as páginas
 * públicas saem com `no-store` (nonce por requisição), então o SW não pode confiar no
 * `Cache-Control`; ele guarda só respostas com este cabeçalho.
 */
export function offlineMarker(
  pathname: string,
  cookieHeader: string | null,
  sections: readonly string[],
): boolean {
  if (routeKind(pathname, sections) === null) return false;
  if (cookieHeader && /(^|;\s*)sb-[^=;]*auth-token[^=;]*=/.test(cookieHeader)) return false;
  return true;
}

function https(req: NextRequest): boolean {
  const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
  return proto.split(",")[0]?.trim() === "https";
}

/**
 * Proxy do portal:
 * - CSP com nonce por requisição (architecture §7). O Next lê o nonce do cabeçalho da
 *   requisição e o aplica aos próprios scripts; o layout raiz o aplica ao script de tema.
 * - Matéria arquivada ou despublicada responde 410 (Review Focus 2): a página mostra o motivo
 *   e aqui só trocamos o status, que o App Router não permite na página.
 */
export async function proxy(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    https: https(req),
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const headers = new Headers(req.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const slug = goneSlugFromPath(req.nextUrl.pathname);
  const check = slug ? goneChecker() : null;
  const gone = !!(slug && check && (await check(slug)));

  const res = NextResponse.next({ request: { headers }, ...(gone ? { status: 410 } : {}) });
  res.headers.set("content-security-policy", csp);
  if (!gone && offlineMarker(req.nextUrl.pathname, req.headers.get("cookie"), SW_SECTIONS))
    res.headers.set(OFFLINE_MARKER_HEADER, "1");
  return res;
}

export const config = {
  matcher: [
    {
      // Páginas HTML. Fora: API, arquivos estáticos, imagens otimizadas, sitemaps, robots e
      // arquivos de /public (brand, offline, ícones do PWA, manifesto).
      source:
        "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|brand/|icons/|manifest\\.webmanifest|offline\\.|sw\\.js|robots.txt|sitemap).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
