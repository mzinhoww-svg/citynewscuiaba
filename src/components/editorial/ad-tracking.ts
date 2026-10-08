"use client";

import { useEffect, type RefObject } from "react";

/*
 * Contagem agregada de anúncio no navegador (ADS-T1, spec banners-padrão §4), usada pelos campos
 * de banner e pelo card patrocinado nativo (B-022): impressão quando aparece e visualização com
 * >= 50% por 1 s, cada uma uma vez por sessão. Sem identificador de pessoa; o servidor ainda
 * deduplica em 30 min.
 */

function once(event: "impression" | "view", id: string): boolean {
  try {
    const k = `cn_ad_${event}_${id}`;
    if (window.sessionStorage.getItem(k)) return false;
    window.sessionStorage.setItem(k, "1");
  } catch {
    // sem armazenamento: conta assim mesmo (o servidor deduplica em 30 min)
  }
  return true;
}

function send(placement: string, section: string | null, event: "impression" | "view") {
  if (!once(event, placement)) return;
  void fetch("/api/ads/view", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ placement, section, event }),
    keepalive: true,
  }).catch(() => undefined);
}

export function useAdTracking(
  ref: RefObject<HTMLElement | null>,
  id: string,
  sectionSlug: string | null,
): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) send(id, sectionSlug, "impression");
          if (e.intersectionRatio >= 0.5) {
            timer ??= setTimeout(() => send(id, sectionSlug, "view"), 1000);
          } else if (timer) {
            clearTimeout(timer);
            timer = null;
          }
        }
      },
      { threshold: [0, 0.5] },
    );
    io.observe(el);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
    };
  }, [ref, id, sectionSlug]);
}
