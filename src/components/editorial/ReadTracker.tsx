"use client";

import { useEffect } from "react";
import { getAnonStore } from "@/lib/anon/store";
import { useConsent } from "@/lib/consent/client";
import { isQualifiedRead } from "@/lib/events/weak";
import { useTrack } from "@/lib/events/use-track";

export interface ReadTrackerProps {
  /** `article:<id>`. */
  contentId: string;
  /** Id do elemento da matéria (mede a rolagem). */
  targetId: string;
  section?: string;
  sourceSlug?: string;
}

function scrollPct(el: HTMLElement): number {
  const rect = el.getBoundingClientRect();
  const total = rect.height - window.innerHeight;
  if (total <= 0) return rect.top < window.innerHeight ? 100 : 0;
  return Math.round(Math.min(1, Math.max(0, -rect.top / total)) * 100);
}

/**
 * Mede a leitura da matéria (sem renderizar nada): tempo com a aba visível e rolagem máxima.
 * Leitura qualificada (≥ 30 s e ≥ 50%, ou ≥ 60 s, spec §7.2) vira `article_read`, só com
 * consentimento. Com Personalização, a leitura também entra no histórico local (30 dias);
 * sem ela, nada é guardado nem enviado.
 */
export function ReadTracker({ contentId, targetId, section, sourceSlug }: ReadTrackerProps) {
  const [consent] = useConsent();
  const send = useTrack();
  const active = consent.decided && (consent.metrics || consent.personalization);

  useEffect(() => {
    if (!active) return;
    const el = document.getElementById(targetId);
    if (!el) return;
    let seconds = 0;
    let maxScroll = scrollPct(el);
    let sent = false;
    let recorded = false;

    const record = () => {
      if (recorded || !consent.personalization) return;
      recorded = true;
      getAnonStore()
        .recordRead({ ref: contentId, seconds, scrollPct: maxScroll, section, sourceSlug })
        .catch(() => undefined);
    };
    const check = () => {
      if (sent || !isQualifiedRead(seconds, maxScroll)) return;
      sent = true;
      void send("article_read", { seconds, scrollPct: maxScroll }, { contentId });
      record();
    };
    const onScroll = () => {
      maxScroll = Math.max(maxScroll, scrollPct(el));
      check();
    };
    const tick = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      seconds += 1;
      check();
    }, 1000);
    const onHide = () => {
      if (document.visibilityState === "hidden") record();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", record);
    return () => {
      window.clearInterval(tick);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", record);
      record();
    };
  }, [active, consent.personalization, contentId, targetId, section, sourceSlug, send]);

  return null;
}
