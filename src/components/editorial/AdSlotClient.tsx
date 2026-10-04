"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { ADS_TEXT } from "@/content/pt-BR/ads";
import { deviceOf, pickCandidate, type AdPlacement } from "@/lib/ads/select";
import type { DisplaySlot } from "@/lib/ads/slots";
import { cx } from "../cx";

/*
 * Campo de banner no navegador (ADS-T1, spec banners-padrão §3): rótulo "Publicidade", altura
 * reservada pelo formato (CLS 0), peça escolhida com a chave da sessão (rotação estável) e
 * contagem agregada: impressão quando aparece, visualização com >= 50% por 1 s, cada uma uma
 * vez por sessão. O clique passa pela rota de redirecionamento, que conta no servidor.
 */

const SESSION_KEY = "cn_ad_session";
const never = () => () => {};

function sessionKey(): string {
  try {
    let k = window.sessionStorage.getItem(SESSION_KEY);
    if (!k) {
      k = crypto.randomUUID();
      window.sessionStorage.setItem(SESSION_KEY, k);
    }
    return k;
  } catch {
    return "sem-sessao";
  }
}

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

function Creative({ ad, sectionSlug }: { ad: AdPlacement; sectionSlug: string | null }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) send(ad.id, sectionSlug, "impression");
          if (e.intersectionRatio >= 0.5) {
            timer ??= setTimeout(() => send(ad.id, sectionSlug, "view"), 1000);
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
  }, [ad.id, sectionSlug]);
  const href = `/api/ads/click/${ad.id}${sectionSlug ? `?s=${sectionSlug}` : ""}`;
  return (
    <a ref={ref} href={href} rel="sponsored noopener" className="block h-full w-full">
      {/* Peça já no tamanho exato do campo; sem otimizador, como as fotos (Photo.tsx). */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={ad.creative.imageUrl}
        alt={ad.creative.alt}
        width={ad.creative.width}
        height={ad.creative.height}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-contain"
      />
    </a>
  );
}

function Variant({
  device,
  candidates,
  sectionSlug,
}: {
  device: "desktop" | "mobile";
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
}) {
  const key = useSyncExternalStore(never, sessionKey, () => null);
  const own = candidates.filter((c) => deviceOf(c) === device);
  const format = own[0]?.creative;
  if (!format) return null;
  const ad = key ? pickCandidate(own, { sessionKey: key, device }) : null;
  return (
    <div
      className={cx(
        "flex flex-col items-center gap-1",
        device === "desktop" ? "hidden lg:flex" : "lg:hidden",
      )}
    >
      <p className="type-meta text-meta">{ADS_TEXT.label}</p>
      <div
        data-ad-box=""
        className="w-full bg-section"
        style={{ aspectRatio: `${format.width} / ${format.height}`, maxWidth: format.width }}
      >
        {ad && <Creative ad={ad} sectionSlug={sectionSlug} />}
      </div>
    </div>
  );
}

export interface AdSlotClientProps {
  code: DisplaySlot;
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
  className?: string;
}

export function AdSlotClient({ code, candidates, sectionSlug, className }: AdSlotClientProps) {
  if (candidates.length === 0) return null;
  return (
    <aside aria-label={ADS_TEXT.label} data-ad-slot={code} className={cx("w-full", className)}>
      <Variant device="desktop" candidates={candidates} sectionSlug={sectionSlug} />
      <Variant device="mobile" candidates={candidates} sectionSlug={sectionSlug} />
    </aside>
  );
}
