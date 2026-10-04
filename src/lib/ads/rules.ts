/**
 * Publicidade (A07, spec §5.1, CLAUDE.md §5.8/§5.9/§5.3): onde um card patrocinado pode entrar
 * numa lista editorial. Regras fixas, visíveis na tela e nunca sobrepostas pela campanha:
 * - no máximo 1 a cada 6 cards, nunca na posição da manchete (índice 0);
 * - nunca em Política, Segurança ou Saúde, nem em lista de respostas da IA;
 * - nunca ao lado de card urgente nem de contexto sensível (segurança, saúde individual,
 *   tragédia);
 * - o card leva o rótulo PATROCINADO e não conta como editorial.
 * Puro: a home e as editorias chamam com os cards já carregados.
 */

export interface AdCard {
  id: string;
  sectionSlug: string;
  urgent?: boolean;
  /** Contexto sensível (crime, tragédia, saúde individual): sem anúncio ao lado. */
  sensitive?: boolean;
  /** Card de resposta da IA (Pergunte): lista inteira fica sem anúncio. */
  aiAnswer?: boolean;
  sponsored?: boolean;
}

export interface Campaign {
  id: string;
  advertiser: string;
  startsOn: string;
  endsOn: string;
  allowedSections: string[];
  status: "draft" | "active" | "paused" | "ended";
  creative: { title: string; href: string; imageUrl?: string; imageAlt?: string };
}

export interface PlacedCard<T extends AdCard = AdCard> {
  card: T | null;
  /** Patrocinado inserido nesta posição (com `label: "sponsored"`). */
  sponsored?: {
    campaignId: string;
    advertiser: string;
    label: "PATROCINADO";
    creative: Campaign["creative"];
  };
}

export const NEVER_SECTIONS: readonly string[] = ["politica", "justica", "seguranca", "saude"];

/**
 * A editoria (ou a categoria de autonomia dela, `sections.autonomy_category`) é Política,
 * Justiça, Segurança ou Saúde? Subeditoria herda: vale a categoria e também o prefixo do slug
 * (`politica-municipal`). O banco confere a mesma coisa em `is_never_sponsored_section` (0075).
 */
export function isNeverSection(
  slug: string,
  categoryOf?: (slug: string) => string | undefined,
): boolean {
  const keys = [slug, categoryOf?.(slug)].filter((k): k is string => Boolean(k));
  return keys.some((k) => NEVER_SECTIONS.some((n) => k === n || k.startsWith(`${n}-`)));
}
export const SLOT_EVERY = 6;

/**
 * Matéria patrocinada da home (MS-T1): só com `sponsored_native_enabled` ligada, nunca em
 * editoria proibida (nem subeditoria) e nunca urgente. O banco recusa os dois casos
 * (`guard_article_sponsored`, 0075); aqui a home não confia só nele.
 */
export function pickHomeSponsored<
  T extends { sponsored: boolean; urgent: boolean; section: { slug: string } },
>(
  articles: readonly T[],
  opts: { enabled: boolean; categoryOf?: (slug: string) => string | undefined },
): T | null {
  if (!opts.enabled) return null;
  return (
    articles.find(
      (a) => a.sponsored && !a.urgent && !isNeverSection(a.section.slug, opts.categoryOf),
    ) ?? null
  );
}

/** Campanha vale hoje (dentro do período e ativa). */
export function campaignLive(c: Campaign, now: Date): boolean {
  const day = now.toISOString().slice(0, 10);
  return c.status === "active" && c.startsOn <= day && day <= c.endsOn;
}

export interface PlacementContext {
  /** Editoria da lista (a home é `null`). */
  sectionSlug: string | null;
  now: Date;
  /** Teto por página (`ads.max_per_page`); padrão 1. */
  maxPerPage?: number;
  /** Categoria de autonomia de uma editoria (`sections.autonomy_category`), para subeditorias. */
  categoryOf?: (slug: string) => string | undefined;
}

/**
 * Devolve a lista com os patrocinados intercalados; sem campanha válida ou em contexto
 * proibido, devolve os cards como vieram. `editorialCount` nunca inclui patrocinados.
 */
export function placeSponsored<T extends AdCard>(
  cards: readonly T[],
  campaign: Campaign | null,
  ctx: PlacementContext,
): { items: PlacedCard<T>[]; placed: number; editorialCount: number } {
  const items: PlacedCard<T>[] = cards.map((card) => ({ card }));
  const editorialCount = cards.filter((c) => !c.sponsored).length;
  const max = ctx.maxPerPage ?? 1;
  if (!campaign || !campaignLive(campaign, ctx.now) || max <= 0)
    return { items, placed: 0, editorialCount };
  if (
    ctx.sectionSlug &&
    (isNeverSection(ctx.sectionSlug, ctx.categoryOf) ||
      !campaign.allowedSections.includes(ctx.sectionSlug))
  )
    return { items, placed: 0, editorialCount };
  if (cards.some((c) => c.aiAnswer)) return { items, placed: 0, editorialCount };

  const out: PlacedCard<T>[] = [];
  let placed = 0;
  let sinceLast = 0;
  const bad = (c: T | undefined) =>
    !c ||
    c.urgent === true ||
    c.sensitive === true ||
    c.sponsored === true ||
    isNeverSection(c.sectionSlug, ctx.categoryOf) ||
    (ctx.sectionSlug === null && !campaign.allowedSections.includes(c.sectionSlug));
  for (let i = 0; i < cards.length; i++) {
    out.push({ card: cards[i]! });
    sinceLast++;
    // Nunca antes do índice SLOT_EVERY (a manchete e a primeira dobra ficam livres).
    const slotReady = sinceLast >= SLOT_EVERY && placed < max;
    if (slotReady && !bad(cards[i]) && !bad(cards[i + 1] ?? cards[i])) {
      out.push({
        card: null,
        sponsored: {
          campaignId: campaign.id,
          advertiser: campaign.advertiser,
          label: "PATROCINADO",
          creative: campaign.creative,
        },
      });
      placed++;
      sinceLast = 0;
    }
  }
  return { items: out, placed, editorialCount };
}
