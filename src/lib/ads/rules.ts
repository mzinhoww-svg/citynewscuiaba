/**
 * Regras fixas do patrocinado nativo (spec D17; CLAUDE.md regra 3). Funções puras, sem framework.
 *
 * - No máximo 1 patrocinado a cada 6 cards: só entra depois de 5 cards da lista (índice 5 em
 *   diante) e, por lista, no máximo um.
 * - Nunca em Política, nunca ao lado de urgente, manchete ou resposta de IA, e nunca numa
 *   superfície de resposta de IA (qualquer card `ai_answer` na lista).
 * - O card sempre traz o rótulo PATROCINADO (texto, nunca só cor) e o link do anunciante.
 * - Campanha só vale ativa, dentro do período (inclusivo) e com editorias permitidas.
 */

export const SPONSORED_LABEL = "PATROCINADO";
/** Cards antes do patrocinado: 1 a cada 6 = 5 cards e então 1 patrocinado. */
export const SPONSORED_MIN_GAP = 5;
/** Editoria em que patrocinado nunca aparece (também um check no banco). */
export const FORBIDDEN_SECTION = "politica";

export type CardKind = "article" | "aggregated" | "ai_answer" | "sponsored";

export interface Card {
  id: string;
  /** Slug da editoria do card. */
  section: string;
  kind?: CardKind;
  urgent?: boolean;
  /** Manchete (lead) da página. */
  headline?: boolean;
  title?: string;
  href?: string;
  /** Rótulo de origem; o patrocinado sempre tem `PATROCINADO`. */
  label?: string;
}

export interface SponsoredCampaign {
  id: string;
  advertiser: string;
  /** AAAA-MM-DD, inclusivo. */
  startsOn: string;
  endsOn: string;
  allowedSections: readonly string[];
  active: boolean;
  creative: { headline: string; url: string };
}

/** Campanha ativa, dentro do período e com pelo menos uma editoria permitida (sem Política). */
export function campaignEligible(campaign: SponsoredCampaign, today: string): boolean {
  return (
    campaign.active &&
    campaign.startsOn <= today &&
    today <= campaign.endsOn &&
    campaign.allowedSections.some((s) => s !== FORBIDDEN_SECTION)
  );
}

const protectedCard = (c: Card | undefined): boolean =>
  c !== undefined &&
  (c.urgent === true ||
    c.headline === true ||
    c.kind === "ai_answer" ||
    c.section === FORBIDDEN_SECTION);

/**
 * Insere no máximo um card patrocinado em `cards` (sem alterar a lista recebida). `today` é a
 * data do dia em AAAA-MM-DD (fuso de Cuiabá) e serve ao período da campanha.
 */
export function placeSponsored(
  cards: readonly Card[],
  campaign: SponsoredCampaign,
  today: string,
): Card[] {
  const out = [...cards];
  if (!campaignEligible(campaign, today)) return out;
  if (cards.some((c) => c.kind === "ai_answer" || c.kind === "sponsored")) return out;

  for (let k = SPONSORED_MIN_GAP; k <= cards.length; k++) {
    const before = cards[k - 1];
    const after = cards[k];
    if (before === undefined || protectedCard(before) || protectedCard(after)) continue;
    if (!campaign.allowedSections.includes(before.section)) continue;
    out.splice(k, 0, {
      id: `sponsored-${campaign.id}`,
      section: before.section,
      kind: "sponsored",
      title: campaign.creative.headline,
      href: campaign.creative.url,
      label: SPONSORED_LABEL,
    });
    return out;
  }
  return out;
}

export type CampaignStatus = "active" | "paused" | "scheduled" | "expired";

/** Situação da campanha para a tela: encerrada e agendada vêm do período; ativa exige `active`. */
export function campaignStatus(campaign: SponsoredCampaign, today: string): CampaignStatus {
  if (today > campaign.endsOn) return "expired";
  if (today < campaign.startsOn) return "scheduled";
  return campaign.active ? "active" : "paused";
}
