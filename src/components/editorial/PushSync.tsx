"use client";

import { useEffect } from "react";
import { useConsent, useConsentKnown } from "@/lib/consent/client";
import { syncPush } from "@/lib/push/client";

/**
 * Sincroniza a inscrição de push ao carregar e quando o consentimento muda (spec §9.2,
 * Review Focus 5): alvos atuais, `metrics_consent`, `last_seen_at`; token perdido ou 404 vira
 * `lost`. Não renderiza nada; nunca pede permissão.
 */
export function PushSync() {
  const [consent] = useConsent();
  const known = useConsentKnown();
  useEffect(() => {
    if (!known) return;
    const t = window.setTimeout(() => void syncPush(consent.decided && consent.metrics), 1500);
    return () => window.clearTimeout(t);
  }, [known, consent.decided, consent.metrics]);
  return null;
}
