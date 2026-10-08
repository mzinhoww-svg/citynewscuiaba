"use client";

import { useEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { ADS_TEXT } from "@/content/pt-BR/ads";
import { useCurrentInvite } from "@/lib/app/slot";
import { formatFor, pickCandidate, type AdPlacement } from "@/lib/ads/select";
import type { Device, DisplaySlot } from "@/lib/ads/slots";
import { cx } from "../cx";
import { IconButton } from "../ui/IconButton";
import { useAdTracking } from "./ad-tracking";

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

function Creative({ ad, sectionSlug }: { ad: AdPlacement; sectionSlug: string | null }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useAdTracking(ref, ad.id, sectionSlug);
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

/** Rodapé fechado nesta sessão (lembrado no sessionStorage; avisa os inscritos ao fechar). */
let closedLocally = false;
const closedSubs = new Set<() => void>();
function subscribeClosed(cb: () => void) {
  closedSubs.add(cb);
  return () => {
    closedSubs.delete(cb);
  };
}
function stickyClosed(): boolean {
  try {
    return window.sessionStorage.getItem(STICKY_CLOSED) === "1";
  } catch {
    return false;
  }
}
function closeSticky() {
  try {
    window.sessionStorage.setItem(STICKY_CLOSED, "1");
  } catch {
    // sem armazenamento: o rodapé some só até a próxima página
  }
  closedLocally = true;
  for (const cb of closedSubs) cb();
}

/** Passou de 40% da rolagem? (o rodapé nunca aparece junto com a faixa de topo, que já saiu) */
function scrolledEnough(): boolean {
  const max = document.documentElement.scrollHeight - window.innerHeight;
  return max > 0 && window.scrollY / max >= STICKY_AFTER;
}
function subscribeScroll(cb: () => void) {
  window.addEventListener("scroll", cb, { passive: true });
  window.addEventListener("resize", cb, { passive: true });
  return () => {
    window.removeEventListener("scroll", cb);
    window.removeEventListener("resize", cb);
  };
}

function Sticky({
  candidates,
  sectionSlug,
}: {
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
}) {
  const closed = useSyncExternalStore(
    subscribeClosed,
    () => closedLocally || stickyClosed(),
    () => true,
  );
  const show = useSyncExternalStore(subscribeScroll, scrolledEnough, () => false);
  const invite = useCurrentInvite();
  if (!show || closed || invite !== null) return null;
  return <StickyBar candidates={candidates} sectionSlug={sectionSlug} />;
}

/**
 * Altura do rodapé fixo em `--cn-ad-h` e `data-ad-open` no `<html>` enquanto ele está na tela
 * (item 64, mesmo padrão do banner de consentimento): a página ganha esse espaço no fim e no
 * `scroll-padding-bottom`, então o anúncio nunca cobre o fim do texto nem o item focado. A partir
 * de `md` o rodapé não aparece (`md:hidden`) e a altura medida é 0.
 */
function useReserveAdSpace(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const root = document.documentElement;
    const apply = () => root.style.setProperty("--cn-ad-h", `${el.offsetHeight}px`);
    apply();
    root.setAttribute("data-ad-open", "");
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(apply);
    ro?.observe(el);
    return () => {
      ro?.disconnect();
      root.removeAttribute("data-ad-open");
      root.style.removeProperty("--cn-ad-h");
    };
  }, [ref]);
}

function StickyBar({
  candidates,
  sectionSlug,
}: {
  candidates: readonly AdPlacement[];
  sectionSlug: string | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useReserveAdSpace(ref);
  return (
    <div
      ref={ref}
      data-ad-sticky=""
      className="fixed inset-x-0 bottom-tabbar-safe z-sticky flex items-center justify-center gap-2 border-t border-line-section bg-card-white px-gutter py-1 md:hidden"
    >
      <div className="min-w-0 flex-1">
        <Variant code="STICKY" device="mobile" candidates={candidates} sectionSlug={sectionSlug} />
      </div>
      <IconButton
        icon="x"
        label={ADS_TEXT.closeSticky}
        variant="ghost"
        size={44}
        onClick={closeSticky}
      />
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
