"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import { registerSwOnIdle, sendConsentToSw } from "@/lib/offline/sw";

/**
 * Registra o service worker nas páginas públicas (D-P11) depois do `load` e em ocioso, e
 * manda ao SW o consentimento de métricas ao montar e a cada mudança (D-P21): o SW não lê
 * cookies, então só pinga o recibo com o que a página informou. Não renderiza nada.
 */
export function SwRegistrar() {
  const pathname = usePathname() ?? "/";
  const [consent] = useConsent();
  const known = useConsentKnown();

  useEffect(() => {
    registerSwOnIdle(pathname);
    // Só o primeiro caminho importa: o registro vale para o escopo inteiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!known) return;
    void sendConsentToSw({ metrics: consent.decided && consent.metrics });
  }, [known, consent.decided, consent.metrics]);

  return null;
}
