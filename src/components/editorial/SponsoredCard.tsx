"use client";

import { useRef } from "react";
import type { NativeAd } from "@/lib/ads/native";
import { cx } from "../cx";
import { MetaRow } from "./MetaRow";
import { useAdTracking } from "./ad-tracking";

export interface SponsoredCardProps {
  ad: NativeAd;
  className?: string;
}

/**
 * Card patrocinado nativo da lista (B-022, `NATIVE-LIST-CARD`). Mesma forma do card padrão de
 * matéria (foto 3:2 opcional, título como link, linha de meta), sem editoria nem plaqueta:
 * "Patrocinado" em texto ao lado do anunciante (CLAUDE.md §5.3, DESIGN.md "Conteúdo pago").
 * O link passa pela rota de clique (conta e redireciona) com `rel="sponsored noopener"`; a
 * impressão e a visualização são contadas como nos campos de banner. Sem `next/link`: o
 * prefetch contaria clique.
 *
 * ```tsx
 * <SponsoredCard ad={item.ad} />
 * ```
 */
export function SponsoredCard({ ad, className }: SponsoredCardProps) {
  const ref = useRef<HTMLElement>(null);
  useAdTracking(ref, ad.campaignId, ad.sectionSlug);
  return (
    <article
      ref={ref}
      data-sponsored=""
      className={cx("relative flex flex-col gap-3.5 [--card-radius:var(--r-0)]", className)}
    >
      {ad.imageUrl && (
        <div className="order-1 w-full overflow-hidden bg-section" style={{ aspectRatio: "3 / 2" }}>
          {/* Imagem do anunciante (https validado no Estúdio); sem otimizador, como os banners. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ad.imageUrl}
            alt={ad.imageAlt ?? ""}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div className="order-3 flex min-w-0 flex-1 flex-col gap-2">
        <h3 className="type-headline line-clamp-3 text-strong">
          <a href={ad.href} rel="sponsored noopener" className="card-link no-underline">
            {ad.title}
          </a>
        </h3>
        <MetaRow className="flex-wrap" author={ad.advertiser} sponsoredText={ad.label} />
      </div>
    </article>
  );
}
