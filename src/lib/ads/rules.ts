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
/** Editoria em que patrocinado nunca aparece (também um trigger no banco: 0038). */
export const FORBIDDEN_SECTION = "politica";

/** Editoria como a tabela `sections` a descreve. */
export interface SectionRef {
  slug: string;
  parentSlug: string | null;
  autonomyCategory: string | null;
}

/**
 * Todo slug tratado como Política: o próprio `politica`, qualquer editoria de categoria de
 * autonomia `politica` e qualquer descendente de uma delas (subeditorias, em qualquer nível).
 */
export function politicalSlugs(sections: readonly SectionRef[]): ReadonlySet<string> {
  const out = new Set<string>([FORBIDDEN_SECTION]);
  for (const s of sections) if (s.autonomyCategory === FORBIDDEN_SECTION) out.add(s.slug);
  let grew = true;
  while (grew) {
    grew = false;
    for (const s of sections) {
      if (!out.has(s.slug) && s.parentSlug !== null && out.has(s.parentSlug)) {
        out.add(s.slug);
        grew = true;
      }
    }
  }
  return out;
}

const NO_EXTRA: ReadonlySet<string> = new Set([FORBIDDEN_SECTION]);

export type CardKind = "article" | "aggregated" | "ai_answer" | "sponsored";

export interface Card {
  id: string;
  /** Slug da editoria do card. */
  section: string;
  /** Categoria de autonomia da editoria (Política em qualquer editoria conta como Política). */
  category?: string;
  /** Editoria-mãe, quando o card é de uma subeditoria. */
  parentSlug?: string;
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
export function campaignEligible(
  campaign: SponsoredCampaign,
  today: string,
  political: ReadonlySet<string> = NO_EXTRA,
): boolean {
  return (
    campaign.active &&
    campaign.startsOn <= today &&
    today <= campaign.endsOn &&
    campaign.allowedSections.some((s) => !political.has(s) && s !== FORBIDDEN_SECTION)
  );
}

const isPoliticalCard = (c: Card, political: ReadonlySet<string>): boolean =>
  political.has(c.section) ||
  c.section === FORBIDDEN_SECTION ||
  c.category === FORBIDDEN_SECTION ||
  c.parentSlug === FORBIDDEN_SECTION ||
  (c.parentSlug !== undefined && political.has(c.parentSlug));

const protectedCard = (c: Card | undefined, political: ReadonlySet<string>): boolean =>
  c !== undefined &&
  (c.urgent === true ||
    c.headline === true ||
    c.kind === "ai_answer" ||
    isPoliticalCard(c, political));

/**
 * Insere no máximo um card patrocinado em `cards` (sem alterar a lista recebida). `today` é a
 * data do dia em AAAA-MM-DD (fuso de Cuiabá) e serve ao período da campanha.
 */
export function placeSponsored(
  cards: readonly Card[],
  campaign: SponsoredCampaign,
  today: string,
  political: ReadonlySet<string> = NO_EXTRA,
): Card[] {
  const out = [...cards];
  if (!campaignEligible(campaign, today, political)) return out;
  if (cards.some((c) => c.kind === "ai_answer" || c.kind === "sponsored")) return out;

  for (let k = SPONSORED_MIN_GAP; k <= cards.length; k++) {
    const before = cards[k - 1];
    const after = cards[k];
    if (before === undefined || protectedCard(before, political) || protectedCard(after, political))
      continue;
    if (!campaign.allowedSections.includes(before.section)) continue;
    if (political.has(before.section)) continue;
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
