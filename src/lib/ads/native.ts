/**
 * Patrocínio nativo nas listas do portal (B-022, MS-T1, docs/media-slots.md `NATIVE-LIST-CARD`).
 * Liga `placeSponsored` às listas reais: com o interruptor `sponsored_native_enabled` desligado
 * a lista sai idêntica; ligado, as regras fixas de `./rules` decidem (1 a cada 6, nunca na
 * manchete, nunca em Política, Justiça, Segurança ou Saúde, nunca em respostas do Pergunte,
 * nunca ao lado de urgente ou sensível). O card leva "Patrocinado" em texto (CLAUDE.md §5.3) e o
 * link passa pela rota de clique, que conta e redireciona (ADS-T1). Puro.
 */
import { PUBLIC_LABEL } from "@/content/pt-BR/labels";
import { placeSponsored, type AdCard, type Campaign, type PlacementContext } from "./rules";

/** O que a lista precisa saber de cada matéria para decidir a posição do patrocinado. */
export interface FeedArticle {
  id: string;
  section: { slug: string };
  urgent: boolean;
  sponsored: boolean;
  /** Comoção nacional (tragédia): contexto sensível, sem anúncio ao lado. */
  nationalCommotion?: boolean;
  /** Matéria em revisão por denúncias: também fica sem anúncio ao lado. */
  reviewBanner?: boolean;
}

export interface NativeAd {
  campaignId: string;
  advertiser: string;
  /** Texto público ("Patrocinado"), nunca uma plaqueta. */
  label: typeof PUBLIC_LABEL.sponsored;
  title: string;
  /** Rota de clique (`/api/ads/click/[id]`), nunca o link do anunciante direto. */
  href: string;
  imageUrl?: string;
  imageAlt?: string;
  sectionSlug: string | null;
}

export type FeedItem<T> = { kind: "article"; article: T } | { kind: "sponsored"; ad: NativeAd };

export interface NativeOptions extends PlacementContext {
  /** `feature_flags.sponsored_native_enabled`; desligado = lista idêntica. */
  enabled: boolean;
  campaign: Campaign | null;
  /** Lista de respostas do Pergunte: nunca recebe patrocinado. */
  aiAnswer?: boolean;
}

/** Link do card: conta o clique e redireciona para o anunciante (302). */
export function nativeClickHref(campaignId: string, sectionSlug: string | null): string {
  const base = `/api/ads/click/${encodeURIComponent(campaignId)}`;
  return sectionSlug ? `${base}?s=${encodeURIComponent(sectionSlug)}` : base;
}

export function withNativeSponsored<T extends FeedArticle>(
  articles: readonly T[],
  opts: NativeOptions,
): FeedItem<T>[] {
  const plain = articles.map((article): FeedItem<T> => ({ kind: "article", article }));
  if (!opts.enabled || !opts.campaign) return plain;
  const cards: (AdCard & { article: T })[] = articles.map((a) => ({
    id: a.id,
    sectionSlug: a.section.slug,
    urgent: a.urgent,
    sensitive: a.nationalCommotion === true || a.reviewBanner === true,
    sponsored: a.sponsored,
    aiAnswer: opts.aiAnswer === true,
    article: a,
  }));
  const { items, placed } = placeSponsored(cards, opts.campaign, opts);
  if (placed === 0) return plain;
  return items.map((it): FeedItem<T> => {
    if (it.card) return { kind: "article", article: it.card.article };
    const s = it.sponsored!;
    return {
      kind: "sponsored",
      ad: {
        campaignId: s.campaignId,
        advertiser: s.advertiser,
        label: PUBLIC_LABEL.sponsored,
        title: s.creative.title,
        href: nativeClickHref(s.campaignId, opts.sectionSlug),
        ...(s.creative.imageUrl ? { imageUrl: s.creative.imageUrl } : {}),
        ...(s.creative.imageUrl && s.creative.imageAlt ? { imageAlt: s.creative.imageAlt } : {}),
        sectionSlug: opts.sectionSlug,
      },
    };
  });
}
