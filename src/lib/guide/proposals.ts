import { canAutoPublish, MIN_SOURCES_PER_VENUE, type ListDraft } from "./auto-publish";
import { categoryBySlug } from "./categories";
import { listCriteriaText } from "./criteria";
import { rankList, type ScoredVenue } from "./rank";
import { DEFAULT_WEIGHTS, scoreVenue, type VenueSignals, type Weights } from "./score";
import type { DataSource, GuideItem, GuideTemplate, ListProposal, Venue } from "./types";
import { fold as foldText } from "@/lib/text/fold";

/**
 * Motor de propostas (GUIA-T4): monta a lista de um modelo do catálogo ou de lugares conferidos
 * a partir de um link. Funções puras: o banco e a rede ficam nas bordas. A ordem dos lugares vem
 * só de `scoreVenue`; nada do portal de origem de um link entra na proposta além dos nomes.
 */

const fold = (s: string) => foldText(s).trim();

export const CITY = "Cuiabá";

/** Sinais de pontuação de um lugar. */
export function signalsOf(v: Venue, mentions: number): VenueSignals {
  return {
    rating: v.rating,
    ratingCount: v.ratingCount,
    tripadvisorRank: v.tripadvisorRank,
    localMentions: mentions,
    fields: {
      address: !!v.address,
      coordinates: v.lat !== null && v.lng !== null,
      neighborhood: !!v.neighborhood,
      phone: !!v.phone,
      hours: !!v.hours,
      website: !!v.website,
    },
  };
}

export type MentionCounts = ReadonlyMap<string, number>;

function rankVenues(
  venues: readonly Venue[],
  mentions: MentionCounts,
  weights: Weights,
  take: number,
) {
  const scored = venues.map((v) => {
    const s = scoreVenue(signalsOf(v, mentions.get(v.id) ?? 0), weights);
    return {
      venueId: v.id,
      name: v.name,
      score: s.score,
      breakdown: s.breakdown,
    } satisfies ScoredVenue;
  });
  return rankList(scored, take);
}

const toItems = (ranked: ReturnType<typeof rankVenues>): GuideItem[] =>
  ranked.map((r) => ({
    position: r.position,
    venueId: r.venueId,
    score: r.score,
    breakdown: r.breakdown,
    editorNote: null,
  }));

function sourcesOf(venues: readonly Venue[], ids: readonly string[]): DataSource[] {
  const set = new Set<DataSource>();
  for (const v of venues) if (ids.includes(v.id)) for (const s of v.sources) set.add(s);
  return [...set];
}

/** Sinais com dado de verdade na lista: o texto "Como escolhemos" só cita o que foi usado. */
function usedSignals(venues: readonly Venue[], ids: readonly string[], mentions: MentionCounts) {
  const mine = venues.filter((v) => ids.includes(v.id));
  return {
    rating: mine.some((v) => v.rating !== null && (v.ratingCount ?? 0) > 0),
    rank: mine.some((v) => v.tripadvisorRank !== null),
    mentions: mine.some((v) => (mentions.get(v.id) ?? 0) > 0),
  };
}

/** Lugar elegível para o modelo: ativo, da categoria, do bairro e da cozinha, com 2+ fontes. */
export function eligibleFor(t: GuideTemplate, v: Venue): boolean {
  if (v.status !== "active" || v.category !== t.category) return false;
  if (t.subcategory && v.subcategory !== t.subcategory) return false;
  if (t.neighborhood && fold(v.neighborhood ?? "") !== fold(t.neighborhood)) return false;
  return new Set(v.sources).size >= MIN_SOURCES_PER_VENUE;
}

export function proposeFromTemplate(
  t: GuideTemplate,
  venues: readonly Venue[],
  opts: { mentions?: MentionCounts; weights?: Weights } = {},
): ListProposal {
  const mentions = opts.mentions ?? new Map<string, number>();
  const weights = opts.weights ?? DEFAULT_WEIGHTS;
  const pool = venues.filter((v) => eligibleFor(t, v));
  const ranked = rankVenues(pool, mentions, weights, t.take);
  const ids = ranked.map((r) => r.venueId);
  return {
    origin: "template",
    title: t.title,
    slug: t.slug,
    category: t.category,
    subcategory: t.subcategory,
    neighborhood: t.neighborhood,
    criteria: listCriteriaText(t, weights, { signals: usedSignals(pool, ids, mentions) }),
    take: t.take,
    templateSlug: t.slug,
    items: toItems(ranked),
    dataSources: sourcesOf(pool, ids),
  };
}

/** O que um lugar precisa para contar como verificado: um provedor o reconhece e está ativo. */
export const isVerified = (v: Venue): boolean =>
  v.status === "active" && !!(v.placeIds.osm || v.placeIds.tripadvisor || v.placeIds.wikidata);

/** Rascunho para `canAutoPublish` a partir de uma proposta e dos lugares dela. */
export function draftOf(
  p: ListProposal,
  venues: readonly Venue[],
  mentions: MentionCounts = new Map(),
  sponsored = false,
): ListDraft {
  const byId = new Map(venues.map((v) => [v.id, v]));
  return {
    origin: p.origin,
    criteria: p.criteria,
    sponsored,
    items: p.items.map((i) => {
      const v = byId.get(i.venueId);
      return {
        venueId: i.venueId,
        verified: v ? isVerified(v) : false,
        sources: v ? new Set(v.sources).size : 0,
        hasQualitySignal: v
          ? (v.rating !== null && (v.ratingCount ?? 0) > 0) ||
            v.tripadvisorRank !== null ||
            (mentions.get(v.id) ?? 0) > 0
          : false,
      };
    }),
  };
}

export function autoPublishCheck(
  t: Pick<GuideTemplate, "minVenues">,
  p: ListProposal,
  venues: readonly Venue[],
  mentions: MentionCounts = new Map(),
) {
  return canAutoPublish(draftOf(p, venues, mentions), t.minVenues);
}

// ---------------------------------------------------------------------------
// Proposta por link
// ---------------------------------------------------------------------------

export interface LinkAnalysis {
  sourceHost: string;
  extractedNames: string[];
  verifiedNames: string[];
  discardedNames: string[];
  criteriaKind: string | null;
  notes: string[];
}

export type LinkProposalError = "too_few_verified";

export const MIN_LINK_VENUES = 3;

/**
 * Lista do CityNews a partir de nomes conferidos: a ordem é nossa (pontuação), o título e o
 * "Como escolhemos" são nossos. Do portal de origem só ficam o domínio e os nomes.
 */
export function proposeFromLink(input: {
  url: string;
  extracted: { names: string[]; category: string | null; criteria: string | null; notes: string[] };
  verifiedNames: string[];
  venues: readonly Venue[];
  category?: string | null;
  take?: number;
  mentions?: MentionCounts;
  weights?: Weights;
}):
  | { ok: true; proposal: ListProposal; analysis: LinkAnalysis }
  | { ok: false; error: LinkProposalError } {
  const mentions = input.mentions ?? new Map<string, number>();
  const weights = input.weights ?? DEFAULT_WEIGHTS;
  const venues = input.venues.filter((v) => v.status === "active");
  if (venues.length < MIN_LINK_VENUES) return { ok: false, error: "too_few_verified" };

  const take = Math.min(
    input.take ?? (venues.length >= 10 ? 10 : venues.length >= 5 ? 5 : venues.length),
    venues.length,
  );
  const category =
    input.category ?? input.extracted.category ?? venues[0]?.category ?? "restaurante";
  const noun = categoryBySlug(category)?.noun ?? "lugares";
  const ranked = rankVenues(venues, mentions, weights, take);
  const ids = ranked.map((r) => r.venueId);
  const tpl: GuideTemplate = {
    slug: "",
    title: "",
    noun,
    category,
    subcategory: null,
    neighborhood: null,
    take,
    minVenues: MIN_LINK_VENUES,
  };
  const article = categoryBySlug(category)?.gender === "f" ? "As" : "Os";
  const title = `${article} ${ranked.length} melhores ${noun} de ${CITY}`;
  let host = "";
  try {
    host = new URL(input.url).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }
  const verifiedSet = new Set(input.verifiedNames.map(fold));
  return {
    ok: true,
    proposal: {
      origin: "link",
      title,
      slug: "",
      category,
      subcategory: null,
      neighborhood: null,
      criteria: listCriteriaText(tpl, weights, { signals: usedSignals(venues, ids, mentions) }),
      take: ranked.length,
      templateSlug: null,
      items: toItems(ranked),
      dataSources: sourcesOf(venues, ids),
    },
    analysis: {
      sourceHost: host,
      extractedNames: input.extracted.names,
      verifiedNames: input.extracted.names.filter((n) => verifiedSet.has(fold(n))),
      discardedNames: input.extracted.names.filter((n) => !verifiedSet.has(fold(n))),
      criteriaKind: input.extracted.criteria,
      notes: input.extracted.notes,
    },
  };
}
