"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ADS_TEXT } from "@/content/pt-BR/ads";
import { useCurrentInvite } from "@/lib/app/slot";
import { formatFor, pickCandidate, type AdPlacement } from "@/lib/ads/select";
import type { Device, DisplaySlot } from "@/lib/ads/slots";
import { cx } from "../cx";
import { IconButton } from "../ui/IconButton";

/*
 * Campo de banner no navegador (ADS-T1/T2, spec banners-padrão §3): rótulo "Publicidade", altura
 * reservada pelo formato de cada aparelho (desktop, tablet com formato próprio, celular; CLS 0),
 * peça escolhida com a chave da sessão (rotação estável) e contagem agregada: impressão quando
 * aparece, visualização com >= 50% por 1 s, cada uma uma vez por sessão. O clique passa pela
 * rota de redirecionamento, que conta no servidor. O rodapé fixo (STICKY) só existe no celular,
 * empilhado sobre a barra inferior, depois de 40% da rolagem, dispensável e lembrado na sessão.
 */

const SESSION_KEY = "cn_ad_session";
const STICKY_CLOSED = "cn_ad_sticky_closed";
const STICKY_AFTER = 0.4;
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

/** Onde cada aparelho aparece: desktop a partir de lg, tablet de md a lg, celular abaixo de md. */
const SHOW: Record<Device, string> = {
  desktop: "hidden lg:flex",
  tablet: "hidden md:flex lg:hidden",
  mobile: "flex md:hidden",
};

function Variant({
  code,
  device,
  candidates,
  sectionSlug,
}: {
  code: DisplaySlot;
  device: Device;
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
}) {
  const key = useSyncExternalStore(never, sessionKey, () => null);
  const format = formatFor(code, device, candidates);
  if (!format) return null;
  const ad = key ? pickCandidate(candidates, { sessionKey: key, device }) : null;
  return (
    <div className={cx("flex-col items-center gap-1", SHOW[device])}>
      <p className="type-meta text-meta">{ADS_TEXT.label}</p>
      <div
        data-ad-box=""
        data-ad-device={device}
        className="w-full bg-section"
        style={{ aspectRatio: `${format.width} / ${format.height}`, maxWidth: format.width }}
      >
        {ad && <Creative ad={ad} sectionSlug={sectionSlug} />}
      </div>
    </div>
  );
}

function stickyClosed(): boolean {
  try {
    return window.sessionStorage.getItem(STICKY_CLOSED) === "1";
  } catch {
    return false;
  }
}

/** Passou de 40% da rolagem? (o rodapé nunca aparece junto com a faixa de topo, que já saiu) */
function scrolledEnough(): boolean {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 && window.scrollY / max >= STICKY_AFTER;
}

function Sticky({
  candidates,
  sectionSlug,
}: {
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
}) {
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);
  const invite = useCurrentInvite();
  useEffect(() => {
    if (stickyClosed()) {
      setClosed(true);
      return;
    }
    const check = () => {
      if (scrolledEnough()) setShow(true);
    };
    check();
    window.addEventListener("scroll", check, { passive: true });
    return () => window.removeEventListener("scroll", check);
  }, []);
  if (!show || closed || invite !== null) return null;
  const close = () => {
    try {
      window.sessionStorage.setItem(STICKY_CLOSED, "1");
    } catch {
      // sem armazenamento: fecha só nesta página
    }
    setClosed(true);
  };
  return (
    <div
      data-ad-sticky=""
      className="fixed inset-x-0 bottom-tabbar-safe z-sticky flex items-center justify-center gap-2 border-t border-line-section bg-card-white px-gutter py-1 md:hidden"
    >
      <div className="min-w-0 flex-1">
        <Variant code="STICKY" device="mobile" candidates={candidates} sectionSlug={sectionSlug} />
      </div>
      <IconButton icon="x" label={ADS_TEXT.closeSticky} variant="ghost" size={44} onClick={close} />
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
  if (code === "STICKY") return <Sticky candidates={candidates} sectionSlug={sectionSlug} />;
  return (
    <aside aria-label={ADS_TEXT.label} data-ad-slot={code} className={cx("w-full", className)}>
      {(["desktop", "tablet", "mobile"] as const).map((d) => (
        <Variant key={d} code={code} device={d} candidates={candidates} sectionSlug={sectionSlug} />
      ))}
    </aside>
  );
}
