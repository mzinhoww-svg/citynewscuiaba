import { MIN_CRITERIA_CHARS } from "./auto-publish";
import { guideTags } from "./tags";
import type { TemplateRow } from "./engine";
import {
  autoPublishCheck,
  eligibleFor,
  MIN_LINK_VENUES,
  proposeFromTemplate,
  signalsOf,
  type MentionCounts,
} from "./proposals";
import { rankList } from "./rank";
import { DEFAULT_WEIGHTS, scoreVenue } from "./score";
import type { GuideItem, ListOrigin, ListProposal, Venue } from "./types";

/**
 * Ciclo de vida das listas (GUIA-T7): publicação automática pelas regras do Guia, atualização a
 * cada 90 dias com "Atualizada em" e suspensão por reclamação de um lugar (Review Focus 4).
 * Funções de domínio sobre portas; o banco e o relógio entram por injeção.
 */

export const REFRESH_DAYS = 90;
const DAY = 86_400_000;

export const refreshDueAt = (from: Date) => new Date(from.getTime() + REFRESH_DAYS * DAY);

// ---------------------------------------------------------------------------
// Publicação automática
// ---------------------------------------------------------------------------
export interface AutoPublishDeps {
  /** Interruptor `guide_auto_publish` (o Estúdio desliga em um clique). */
  enabled: () => Promise<boolean>;
  /** Publica pelas regras: status, datas e `published_by = "rule"`. */
  publish: (listId: string, at: Date) => Promise<void>;
  now: () => Date;
}

export type AutoPublishOutcome =
  { published: true } | { published: false; reason: "disabled" | "rules"; missing: string[] };

/**
 * Publica sozinha só quando a lista cumpre todas as regras de `canAutoPublish` (mínimo de lugares
 * conferidos, critério escrito, 2+ fontes por lugar, sinal de qualidade, origem por modelo e sem
 * patrocínio). Qualquer outra fica como proposta para o editor.
 */
export async function autoPublishList(
  deps: AutoPublishDeps,
  r: {
    listId: string;
    template: Pick<TemplateRow, "minVenues">;
    proposal: ListProposal;
    venues: readonly Venue[];
    mentions: MentionCounts;
  },
): Promise<AutoPublishOutcome> {
  if (!(await deps.enabled())) return { published: false, reason: "disabled", missing: [] };
  const check = autoPublishCheck(r.template, r.proposal, r.venues, r.mentions);
  if (!check.ok) return { published: false, reason: "rules", missing: check.missing };
  await deps.publish(r.listId, deps.now());
  return { published: true };
}

// ---------------------------------------------------------------------------
// Atualização de 90 dias
// ---------------------------------------------------------------------------
export interface RefreshableList {
  id: string;
  slug: string;
  origin: ListOrigin;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  criteria: string;
  sponsored: boolean;
  template: TemplateRow | null;
  items: { venue: Venue; note: string | null }[];
}

export interface RefreshDeps {
  /** Lugares atuais da categoria (para a lista de modelo, que pode ganhar lugares novos). */
  venuesOf: (category: string) => Promise<Venue[]>;
  mentions: (venues: readonly Venue[]) => Promise<MentionCounts>;
  apply: (listId: string, items: GuideItem[], at: Date, next: Date) => Promise<void>;
  suspend: (listId: string, reason: string, at: Date) => Promise<void>;
  now: () => Date;
}

export type RefreshOutcome =
  | { status: "refreshed"; reordered: boolean; added: number; removed: number }
  | { status: "suspended"; reason: string };

const sameOrder = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Reordena a lista com os dados de hoje e atualiza "Atualizada em". Lista de modelo recalcula pelo
 * modelo (lugares novos entram, os que caíram saem); lista por link ou manual reavalia os mesmos
 * lugares. Lugar suspenso ou fora do ar sai. Se a lista deixa de cumprir as regras (poucos lugares,
 * critério vazio), vai para suspensa até uma pessoa decidir: nunca fica no ar com dado velho.
 * O patrocínio não entra na conta.
 */
export async function refreshList(
  deps: RefreshDeps,
  list: RefreshableList,
): Promise<RefreshOutcome> {
  const at = deps.now();
  const before = list.items.map((i) => i.venue.id);
  const notes = new Map(list.items.map((i) => [i.venue.id, i.note]));

  let items: GuideItem[];
  let pool: Venue[];
  if (list.origin === "template" && list.template) {
    const all = await deps.venuesOf(list.category);
    pool = all.filter((v) => eligibleFor(list.template as TemplateRow, v));
    const mentions = await deps.mentions(pool);
    const p = proposeFromTemplate(list.template, pool, {
      mentions,
      ...(list.template.weights ? { weights: list.template.weights } : {}),
    });
    items = p.items;
    const check = autoPublishCheck(list.template, p, pool, mentions);
    if (!check.ok) {
      const reason = `refresh: ${check.missing.join(", ")}`;
      await deps.suspend(list.id, reason, at);
      return { status: "suspended", reason };
    }
  } else {
    pool = list.items.map((i) => i.venue).filter((v) => v.status === "active");
    const mentions = await deps.mentions(pool);
    const scored = pool.map((v) => {
      const s = scoreVenue(signalsOf(v, mentions.get(v.id) ?? 0), DEFAULT_WEIGHTS);
      return {
        venueId: v.id,
        name: v.name,
        score: s.score,
        breakdown: s.breakdown as Record<string, number>,
      };
    });
    items = rankList(scored, scored.length).map((r) => ({
      position: r.position,
      venueId: r.venueId,
      score: r.score,
      breakdown: r.breakdown,
      editorNote: null,
    }));
    if (items.length < MIN_LINK_VENUES) {
      const reason = "refresh: min_venues";
      await deps.suspend(list.id, reason, at);
      return { status: "suspended", reason };
    }
  }
  if (list.criteria.trim().length < MIN_CRITERIA_CHARS) {
    const reason = "refresh: criteria";
    await deps.suspend(list.id, reason, at);
    return { status: "suspended", reason };
  }

  const withNotes = items.map((i) => ({ ...i, editorNote: notes.get(i.venueId) ?? null }));
  const after = withNotes.map((i) => i.venueId);
  await deps.apply(list.id, withNotes, at, refreshDueAt(at));
  return {
    status: "refreshed",
    reordered: !sameOrder(
      before.filter((id) => after.includes(id)),
      after.filter((id) => before.includes(id)),
    ),
    added: after.filter((id) => !before.includes(id)).length,
    removed: before.filter((id) => !after.includes(id)).length,
  };
}

export interface RefreshDueDeps extends RefreshDeps {
  due: (now: Date, limit: number) => Promise<RefreshableList[]>;
  /** Invalida as páginas públicas da lista e dos lugares dela. */
  revalidate: (tags: string[]) => Promise<void>;
}

/** Atualiza as listas vencidas (até `limit` por chamada do cron). */
export async function refreshDue(
  deps: RefreshDueDeps,
  limit = 5,
): Promise<{ slug: string; outcome: RefreshOutcome }[]> {
  const out: { slug: string; outcome: RefreshOutcome }[] = [];
  for (const list of await deps.due(deps.now(), limit)) {
    const outcome = await refreshList(deps, list);
    out.push({ slug: list.slug, outcome });
    await deps.revalidate([
      guideTags.index,
      guideTags.list(list.slug),
      ...list.items.map((i) => guideTags.venue(i.venue.slug)),
      "sitemap",
    ]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Reclamação de um lugar
// ---------------------------------------------------------------------------
export interface ReportDeps {
  /** `guide_report_venue` no banco: registra, tira o lugar do ar e suspende todas as listas que o citam. */
  report: (
    venueId: string,
    reason: string,
    contact: string | null,
  ) => Promise<{
    reportId: string;
    suspendedLists: string[];
    venueSlug: string;
    listSlugs: string[];
  }>;
  revalidate: (tags: string[]) => Promise<void>;
}

export type ReportResult =
  | { ok: true; reportId: string; suspended: number }
  | { ok: false; error: "invalid_reason" | "invalid_venue" | "invalid_contact" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** "Informar problema" do lugar: qualquer reclamação suspende as listas que o citam até um humano decidir. */
export async function reportVenue(
  deps: ReportDeps,
  input: { venueId: string; reason: string; contact?: string | null },
): Promise<ReportResult> {
  if (!UUID.test(input.venueId)) return { ok: false, error: "invalid_venue" };
  const reason = input.reason.trim();
  if (reason.length < 5 || reason.length > 1000) return { ok: false, error: "invalid_reason" };
  const contact = input.contact?.trim() || null;
  if (contact && (contact.length > 200 || !EMAIL.test(contact)))
    return { ok: false, error: "invalid_contact" };
  const r = await deps.report(input.venueId, reason, contact);
  await deps.revalidate([
    guideTags.index,
    guideTags.venue(r.venueSlug),
    ...r.listSlugs.map(guideTags.list),
    "sitemap",
  ]);
  return { ok: true, reportId: r.reportId, suspended: r.suspendedLists.length };
}
