import { cookies } from "next/headers";
import type { ReactNode } from "react";
import { PublicShell } from "@/components";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

/**
 * Lê a escolha de privacidade no servidor para o banner não piscar para quem já respondeu.
 * O HTML já é por requisição (nonce da CSP, A-042); o cache continua nos dados.
 */
export default async function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);
  return <PublicShell consent={consent}>{children}</PublicShell>;
}
