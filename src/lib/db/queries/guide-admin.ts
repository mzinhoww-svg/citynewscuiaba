import "server-only";
import type {
  AdminList,
  AdminProposal,
  AdminReport,
  AdminTemplate,
  AdminVenue,
} from "@/components/estudio";
import type { DbClient } from "@/lib/db/client";
import type { Database } from "@/lib/db/types";

/**
 * Leituras do admin do Guia, com a sessão da pessoa (a RLS libera a equipe do Guia e esconde o
 * resto). Nada aqui roda para o público.
 */

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

const LIST_SELECT =
  "*, guide_list_items(position, venue_id, editor_note, score, score_breakdown, venues(*))";

function toList(
  r: Database["public"]["Tables"]["guide_lists"]["Row"] & {
    guide_list_items: {
      position: number;
      venue_id: string;
      editor_note: string | null;
      score: number | null;
      score_breakdown: unknown;
      venues: VenueRow | null;
    }[];
  },
): AdminList {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    intro: r.intro,
    criteria: r.criteria,
    category: r.category,
    neighborhood: r.neighborhood,
    status: r.status as AdminList["status"],
    origin: r.origin as AdminList["origin"],
    sponsored: r.sponsored,
    sponsorName: r.sponsor_name,
    sponsorKind:
      r.sponsor_kind === "partner" || r.sponsor_kind === "citynews" ? r.sponsor_kind : null,
    publishedAt: r.published_at,
    refreshedAt: r.refreshed_at,
    nextRefreshAt: r.next_refresh_at,
    publishedBy: r.published_by,
    suspendedReason: r.suspended_reason,
    createdAt: r.created_at,
    items: [...r.guide_list_items]
      .sort((a, b) => a.position - b.position)
      .flatMap((i) =>
        i.venues
          ? [
              {
                position: i.position,
                venueId: i.venue_id,
                name: i.venues.name,
                neighborhood: i.venues.neighborhood,
                score: i.score ?? 0,
                breakdown: (i.score_breakdown ?? {}) as Record<string, number>,
                sources: i.venues.data_sources,
                rating: i.venues.rating,
                ratingCount: i.venues.rating_count,
                tripadvisorRank: i.venues.tripadvisor_rank,
                note: i.editor_note,
                venueStatus: i.venues.status as AdminList["items"][number]["venueStatus"],
              },
            ]
          : [],
      ),
  };
}

export async function adminLists(db: DbClient, statuses: readonly string[]): Promise<AdminList[]> {
  const { data, error } = await db
    .from("guide_lists")
    .select(LIST_SELECT)
    .in("status", [...statuses])
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`guia listas: ${error.message}`);
  return (data ?? []).map((r) => toList(r as Parameters<typeof toList>[0]));
}

export async function adminProposals(db: DbClient): Promise<AdminProposal[]> {
  const { data, error } = await db
    .from("guide_proposals")
    .select(`id, origin, source_url, created_at, analysis, guide_lists(${LIST_SELECT})`)
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`guia propostas: ${error.message}`);
  return (data ?? []).flatMap((p) =>
    p.guide_lists
      ? [
          {
            id: p.id,
            origin: p.origin as AdminProposal["origin"],
            sourceUrl: p.source_url,
            createdAt: p.created_at,
            analysis: (p.analysis ?? null) as AdminProposal["analysis"],
            list: toList(p.guide_lists as unknown as Parameters<typeof toList>[0]),
          },
        ]
      : [],
  );
}

export async function adminVenues(db: DbClient, limit = 400): Promise<AdminVenue[]> {
  const { data, error } = await db
    .from("venues")
    .select("*, venue_media(media_id, media_assets(status))")
    .order("name")
    .limit(limit);
  if (error) throw new Error(`guia lugares: ${error.message}`);
  return (data ?? []).map((v) => {
    const photo = (v.venue_media ?? []).find((m) => m.media_assets?.status === "approved");
    return {
      id: v.id,
      slug: v.slug,
      name: v.name,
      category: v.category,
      subcategory: v.subcategory,
      neighborhood: v.neighborhood,
      address: v.address,
      phone: v.phone,
      website: v.website,
      instagram: v.instagram,
      hours: v.hours,
      sources: v.data_sources,
      rating: v.rating,
      ratingCount: v.rating_count,
      tripadvisorRank: v.tripadvisor_rank,
      status: v.status as AdminVenue["status"],
      photoMediaId: photo?.media_id ?? null,
    };
  });
}

export async function adminTemplates(db: DbClient): Promise<AdminTemplate[]> {
  const { data, error } = await db.from("guide_templates").select("*").order("slug");
  if (error) throw new Error(`guia modelos: ${error.message}`);
  return (data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    title: t.title,
    noun: t.noun,
    category: t.category,
    subcategory: t.subcategory,
    neighborhood: t.neighborhood,
    take: t.take,
    minVenues: t.min_venues,
    active: t.active,
    lastProposedAt: t.last_proposed_at,
  }));
}

export async function adminOpenReports(db: DbClient): Promise<AdminReport[]> {
  const { data, error } = await db
    .from("venue_reports")
    .select("id, venue_id, reason, contact, created_at, venues(name)")
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`guia reclamações: ${error.message}`);
  const reports = data ?? [];
  // Listas suspensas por cada reclamação numa consulta só (antes, uma contagem por reclamação).
  const suspended = new Map<string, number>();
  if (reports.length > 0) {
    const lists = await db
      .from("guide_lists")
      .select("suspended_reason")
      .eq("status", "suspended")
      .in(
        "suspended_reason",
        reports.map((r) => `venue_report:${r.id}`),
      );
    // Como antes, a contagem é informativa: falha nela mostra 0, sem derrubar a tela.
    for (const l of lists.data ?? []) {
      if (l.suspended_reason)
        suspended.set(l.suspended_reason, (suspended.get(l.suspended_reason) ?? 0) + 1);
    }
  }
  return reports.map((r) => ({
    id: r.id,
    venueId: r.venue_id,
    venueName: r.venues?.name ?? "—",
    reason: r.reason,
    contact: r.contact,
    createdAt: r.created_at,
    suspendedLists: suspended.get(`venue_report:${r.id}`) ?? 0,
  }));
}

export interface GuideStatus {
  openProposals: number;
  publishedLists: number;
  venues: number;
  lastSync: string | null;
  lastPropose: string | null;
  /** A chave do TripAdvisor existe no ambiente do servidor (o valor nunca sai daqui). */
  tripadvisorKey: boolean;
  /** Interruptor `guide_auto_publish` (publicação pelas regras do Guia). */
  autoPublish: boolean;
}

export async function adminStatus(db: DbClient): Promise<GuideStatus> {
  const count = async (
    table: "guide_proposals" | "guide_lists" | "venues",
    col: string,
    val: string,
  ) => {
    const r = await db.from(table).select("id", { count: "exact", head: true }).eq(col, val);
    if (r.error) throw new Error(`guia contagem: ${r.error.message}`);
    return r.count ?? 0;
  };
  const flag = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", "guide_auto_publish")
    .maybeSingle();
  const total = await db.from("venues").select("id", { count: "exact", head: true });
  const last = async (kind: string) => {
    const r = await db
      .from("guide_runs")
      .select("started_at")
      .eq("kind", kind)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return r.data?.started_at ?? null;
  };
  return {
    openProposals: await count("guide_proposals", "status", "open"),
    publishedLists: await count("guide_lists", "status", "published"),
    venues: total.count ?? 0,
    lastSync: await last("venue_sync"),
    lastPropose: await last("propose"),
    tripadvisorKey: Boolean(process.env.TRIPADVISOR_API_KEY?.trim()),
    autoPublish: flag.data?.enabled === true,
  };
}
