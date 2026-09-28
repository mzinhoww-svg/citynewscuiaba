import "server-only";
import { headers } from "next/headers";
import { hitRateLimit } from "@/lib/db/writes";
import { siteUrl } from "@/lib/seo/jsonld";
import { clientRateKey } from "@/lib/security/rate-limit";
import { safeNext } from "./account";

/** Pedidos de link por e-mail (link mágico, recuperação, reenvio): 10 por hora por conexão. */
const EMAIL_LINKS_PER_HOUR = 10;

export type LoginMethod = "email" | "magic_link" | "google";

/** Depois de entrar, toda conta passa pela migração (C06), que segue direto quando não há nada. */
export function afterLogin(next: string | null | undefined, method: LoginMethod): string {
  return `/entrar/migrar?${new URLSearchParams({ next: safeNext(next), metodo: method })}`;
}

/** Volta dos links do Auth (código PKCE trocado em `/auth/callback`). */
export function callbackUrl(params: Record<string, string>): string {
  return `${siteUrl()}/auth/callback?${new URLSearchParams(params)}`;
}

/** Limite de pedidos de e-mail por conexão (IP com hash). Sem sal em produção, recusa. */
export async function allowEmailLink(): Promise<boolean> {
  const key = clientRateKey(await headers(), new Date());
  if (!key) return false;
  const r = await hitRateLimit("auth_email", key, EMAIL_LINKS_PER_HOUR, 3600);
  return r.ok ? r.value : true;
}
