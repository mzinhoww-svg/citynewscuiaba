import {
  autoPublishCheck,
  eligibleFor,
  isVerified,
  proposeFromTemplate,
  type MentionCounts,
} from "./proposals";
import type { Weights } from "./score";
import type { GuideTemplate, ListProposal, Venue } from "./types";

/**
 * Motor das propostas semanais (GUIA-T4): a cada chamada do cron escolhe o próximo modelo do
 * catálogo, monta a lista com os lugares que já temos e grava como proposta. A publicação
 * automática (GUIA-T7) entra por `afterPropose`; sem ela, a proposta fica para o editor.
 */

export interface TemplateRow extends GuideTemplate {
  id: string;
  weights: Weights | null;
}

export interface ProposalWrite {
  proposal: ListProposal;
  /** Vazio para proposta por link ou manual (sem modelo). */
  templateId: string;
  analysis: Record<string, unknown>;
  sourceUrl?: string | null;
  /** Quem pediu a proposta; ausente = cron do Guia. */
  createdBy?: string | null;
}

export interface EngineStore {
  /** Próximo modelo ativo sem lista em andamento (proposta, rascunho, publicada ou suspensa). */
  nextTemplate(now: Date): Promise<TemplateRow | null>;
  venuesFor(t: Pick<GuideTemplate, "category">): Promise<Venue[]>;
  mentions(venues: readonly Venue[]): Promise<MentionCounts>;
  createProposal(w: ProposalWrite): Promise<{ listId: string; proposalId: string }>;
  markProposed(templateId: string, at: Date): Promise<void>;
}

export type ProposeOutcome =
  | { status: "none" }
  | {
      status: "proposed";
      template: string;
      listId: string;
      items: number;
      /** Lugares da lista que já têm 2+ fontes, nota ou ranking e foram conferidos. */
      verified: number;
      /** Lista que cumpre todas as regras de publicação automática (o que falta, se não). */
      autoPublishable: boolean;
      missing: string[];
      published: boolean;
    };

export interface ProposeDeps {
  store: EngineStore;
  now: () => Date;
  /** GUIA-T7: decide e publica sozinho quando a lista cumpre os critérios. */
  afterPropose?: (r: {
    listId: string;
    template: TemplateRow;
    proposal: ListProposal;
    venues: Venue[];
    mentions: MentionCounts;
  }) => Promise<{ published: boolean }>;
}

export async function proposeNextTemplate(deps: ProposeDeps): Promise<ProposeOutcome> {
  const template = await deps.store.nextTemplate(deps.now());
  if (!template) return { status: "none" };
  return proposeForTemplate(deps, template);
}

/** Proposta de um modelo específico (o cron escolhe o próximo; o Estúdio, "Propor agora"). */
export async function proposeForTemplate(
  deps: ProposeDeps,
  template: TemplateRow,
  createdBy: string | null = null,
): Promise<ProposeOutcome> {
  const at = deps.now();

  // Só os elegíveis (ativos, da categoria e do bairro, com 2+ fontes) vão à busca de menções.
  const venues = (await deps.store.venuesFor(template)).filter((v) => eligibleFor(template, v));
  const mentions = await deps.store.mentions(venues);
  const proposal = proposeFromTemplate(template, venues, {
    mentions,
    ...(template.weights ? { weights: template.weights } : {}),
  });
  const check = autoPublishCheck(template, proposal, venues, mentions);

  // Sem lugares suficientes para uma lista decente: não cria proposta vazia, só adia o modelo.
  if (proposal.items.length < 3) {
    await deps.store.markProposed(template.id, at);
    return { status: "none" };
  }

  const { listId } = await deps.store.createProposal({
    proposal,
    templateId: template.id,
    createdBy,
    analysis: {
      origin: "template",
      template: template.slug,
      eligible: proposal.items.length,
      missingForAutoPublish: check.missing,
    },
  });
  await deps.store.markProposed(template.id, at);

  const published = deps.afterPropose
    ? (await deps.afterPropose({ listId, template, proposal, venues, mentions })).published
    : false;
  const byId = new Map(venues.map((v) => [v.id, v]));
  return {
    status: "proposed",
    template: template.slug,
    listId,
    items: proposal.items.length,
    verified: proposal.items.filter((i) => {
      const v = byId.get(i.venueId);
      return v ? isVerified(v) : false;
    }).length,
    autoPublishable: check.ok,
    missing: check.missing,
    published,
  };
}
