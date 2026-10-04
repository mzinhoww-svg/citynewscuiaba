import "server-only";
import { parseCreative } from "@/lib/ads/creative";
import type { OccupancyPlacement, ReportRow } from "@/lib/ads/report";
import type { DbClient } from "@/lib/db/client";
import { studioContext } from "@/lib/studio/context";

/*
 * Leituras do painel de banners (ADS-T4) com a sessão da pessoa: as tabelas `ad_*` e
 * `advertisers` só abrem para admin e editor-chefe (RLS, 0081/0082).
 */

function check(what: string, error: { message: string } | null): void {
  if (error) throw new Error(`ads admin ${what}: ${error.message}`);
}

export type PlacementStatus = "draft" | "active" | "paused" | "ended";

export interface BannerRow {
  id: string;
  slot: string;
  name: string;
  /** `null` = peça da casa. */
  advertiser: string | null;
  imageUrl: string;
  alt: string;
  href: string;
  width: number;
  height: number;
  startsOn: string;
  endsOn: string;
  allowedSections: string[];
  weight: number;
  maxPerDay: number | null;
  status: PlacementStatus;
  isHouse: boolean;
}

const STATUSES: readonly PlacementStatus[] = ["draft", "active", "paused", "ended"];

/** Veiculações com a peça e o anunciante, as mais novas primeiro. */
export async function listBanners(db?: DbClient): Promise<BannerRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("ad_placements")
    .select(
      "id, slot, starts_on, ends_on, allowed_sections, weight, max_impressions_per_day, status, created_at, ad_creatives!inner(name, creative, advertiser_id, advertisers(name))",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  check("banners", error);
  return (data ?? []).flatMap((r): BannerRow[] => {
    const c = r.ad_creatives;
    const parsed = parseCreative(c.creative);
    if (!parsed.ok || parsed.value.kind !== "display") return [];
    const v = parsed.value;
    return [
      {
        id: r.id,
        slot: r.slot,
        name: c.name,
        advertiser: c.advertisers?.name ?? null,
        imageUrl: v.imageUrl,
        alt: v.alt,
        href: v.href,
        width: v.width,
        height: v.height,
        startsOn: r.starts_on,
        endsOn: r.ends_on,
        allowedSections: r.allowed_sections,
        weight: r.weight,
        maxPerDay: r.max_impressions_per_day,
        status: (STATUSES as readonly string[]).includes(r.status)
          ? (r.status as PlacementStatus)
          : "draft",
        isHouse: c.advertiser_id === null,
      },
    ];
  });
}

export function occupancyInput(rows: readonly BannerRow[]): OccupancyPlacement[] {
  return rows.map((b) => ({
    slot: b.slot,
    isHouse: b.isHouse,
    status: b.status,
    startsOn: b.startsOn,
    endsOn: b.endsOn,
  }));
}

/** Contagens agregadas por dia, veiculação e editoria no período (dias de Cuiabá, inclusive). */
export async function adReportRows(
  period: { from: string; to: string },
  db?: DbClient,
): Promise<ReportRow[]> {
  const client = db ?? (await studioContext()).db;
  const { data, error } = await client
    .from("ad_stats")
    .select(
      "day, placement_id, section_slug, impressions, views, clicks, ad_placements!inner(slot, ad_creatives!inner(name, advertisers(name)))",
    )
    .gte("day", period.from)
    .lte("day", period.to)
    .order("day")
    .limit(20_000);
  check("report", error);
  return (data ?? []).map((r) => ({
    day: r.day,
    placementId: r.placement_id,
    slot: r.ad_placements.slot,
    advertiser: r.ad_placements.ad_creatives.advertisers?.name ?? null,
    creative: r.ad_placements.ad_creatives.name,
    section: r.section_slug,
    impressions: r.impressions,
    views: r.views,
    clicks: r.clicks,
  }));
}
