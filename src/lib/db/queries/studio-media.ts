import "server-only";
import type { Database, Json } from "@/lib/db/types";
import { localDateKey } from "@/lib/format/date";
import { expiringLicenses, type LicenseAlert, type LicensedAsset } from "@/lib/media/licenses";
import { studioContext } from "@/lib/studio/context";

type MediaKind = Database["public"]["Enums"]["media_kind"];
type MediaStatus = "pending" | "approved" | "blocked";

export interface MediaCardData {
  id: string;
  kind: MediaKind;
  status: MediaStatus;
  credit: string | null;
  license: string;
  licenseUntil: string | null;
  sourceName: string | null;
  risk: string;
  capturedAt: string;
}

const asStatus = (s: string): MediaStatus =>
  s === "approved" ? "approved" : s === "blocked" ? "blocked" : "pending";

/** Biblioteca (E09): imagens por estado, mais recentes primeiro. */
export async function listMedia(status: MediaStatus): Promise<MediaCardData[]> {
  const ctx = await studioContext();
  const { data, error } = await ctx.db
    .from("media_assets")
    .select("id, kind, status, credit, license, license_until, source_name, risk, captured_at")
    .eq("status", status)
    .order("captured_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(`mídia: ${error.message}`);
  return (data ?? []).map((m) => ({
    id: m.id,
    kind: m.kind,
    status: asStatus(m.status),
    credit: m.credit,
    license: m.license,
    licenseUntil: m.license_until,
    sourceName: m.source_name,
    risk: m.risk,
    capturedAt: m.captured_at,
  }));
}

export interface MediaDetail extends MediaCardData {
  originUrl: string | null;
  pageUrl: string | null;
  allowedUse: string;
  width: number | null;
  height: number | null;
  provenance: Json;
  removalReason: string | null;
  articles: { id: string; title: string; status: string; sectionSlug: string }[];
}

export async function getMedia(id: string): Promise<MediaDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const ctx = await studioContext();
  const { data: m } = await ctx.db
    .from("media_assets")
    .select(
      "id, kind, status, credit, license, license_until, source_name, risk, captured_at, origin_url, page_url, allowed_use, width, height, provenance, removal_reason",
    )
    .eq("id", id)
    .maybeSingle();
  if (!m) return null;
  const { data: links } = await ctx.db
    .from("article_media")
    .select("articles(id, title, status, section_slug)")
    .eq("media_id", id);
  return {
    id: m.id,
    kind: m.kind,
    status: asStatus(m.status),
    credit: m.credit,
    license: m.license,
    licenseUntil: m.license_until,
    sourceName: m.source_name,
    risk: m.risk,
    capturedAt: m.captured_at,
    originUrl: m.origin_url,
    pageUrl: m.page_url,
    allowedUse: m.allowed_use,
    width: m.width,
    height: m.height,
    provenance: m.provenance,
    removalReason: m.removal_reason,
    articles: (links ?? []).flatMap((l) =>
      l.articles
        ? [
            {
              id: l.articles.id,
              title: l.articles.title,
              status: l.articles.status,
              sectionSlug: l.articles.section_slug,
            },
          ]
        : [],
    ),
  };
}

/** Imagens aprovadas e com licença válida hoje: candidatas à troca. */
export async function replacementOptions(
  excludeId: string,
): Promise<{ value: string; label: string }[]> {
  const ctx = await studioContext();
  const today = localDateKey(ctx.now());
  const { data } = await ctx.db
    .from("media_assets")
    .select("id, credit, license, license_until, kind")
    .eq("status", "approved")
    .neq("id", excludeId)
    .or(`license_until.is.null,license_until.gte.${today}`)
    .order("captured_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((m) => ({ value: m.id, label: `${m.credit ?? m.license} · ${m.kind}` }));
}

export interface LicenseRow {
  license: string;
  until: string | null;
  images: number;
  daysLeft: number | null;
  expiredImages: number;
}

export interface LicensesOverview {
  licenses: LicenseRow[];
  alerts: (LicenseAlert & { articleTitle: string })[];
  agreements: { source: string; policy: string; until: string | null }[];
}

/** Direitos e licenças (E11): licenças agrupadas, alertas e acordos por fonte. */
export async function licensesOverview(days = 30): Promise<LicensesOverview> {
  const ctx = await studioContext();
  const today = localDateKey(ctx.now());
  const [{ data: assets, error }, { data: sources }] = await Promise.all([
    ctx.db
      .from("media_assets")
      .select("id, license, license_until, status, article_media(articles(id, title, status))")
      .in("kind", ["licensed", "reproduction", "original", "illustrative"])
      .neq("status", "blocked"),
    ctx.db
      .from("sources")
      .select("name, display_name, image_policy, agreement_until")
      .neq("image_policy", "none")
      .order("name"),
  ]);
  if (error) throw new Error(`licenças: ${error.message}`);
  const list: LicensedAsset[] = (assets ?? []).map((a) => ({
    id: a.id,
    license: a.license,
    licenseUntil: a.license_until,
    status: asStatus(a.status),
    publishedArticles: (a.article_media ?? []).flatMap((am) =>
      am.articles && (am.articles.status === "published" || am.articles.status === "updated")
        ? [{ id: am.articles.id, title: am.articles.title }]
        : [],
    ),
  }));
  const state = expiringLicenses(list, today, days);
  const daysOf = new Map([...state.expiring, ...state.expired].map((s) => [s.id, s.daysLeft]));

  const groups = new Map<string, LicenseRow>();
  for (const a of list.filter((x) => x.licenseUntil !== null)) {
    const g = groups.get(a.license) ?? {
      license: a.license,
      until: a.licenseUntil,
      images: 0,
      daysLeft: null,
      expiredImages: 0,
    };
    g.images += 1;
    if (a.licenseUntil && (!g.until || a.licenseUntil < g.until)) g.until = a.licenseUntil;
    const d = daysOf.get(a.id);
    if (d !== undefined && (g.daysLeft === null || d < g.daysLeft)) g.daysLeft = d;
    if (d !== undefined && d < 0) g.expiredImages += 1;
    groups.set(a.license, g);
  }
  const titles = new Map(list.flatMap((a) => a.publishedArticles.map((p) => [p.id, p.title])));
  return {
    licenses: [...groups.values()].sort((x, y) => (x.until ?? "").localeCompare(y.until ?? "")),
    alerts: state.alerts.map((al) => ({ ...al, articleTitle: titles.get(al.articleId) ?? "" })),
    agreements: (sources ?? []).map((s) => ({
      source: s.display_name ?? s.name,
      policy: s.image_policy,
      until: s.agreement_until,
    })),
  };
}
