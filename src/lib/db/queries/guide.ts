import "server-only";
import { mediaHref } from "@/lib/media/serve";
import { guideTags } from "@/lib/guide/tags";
import type { DataSource } from "@/lib/guide/types";
import { DATA_SOURCES } from "@/lib/guide/types";
import { orderIndexLists } from "@/lib/guide/rank";
import type { Result } from "@/lib/result";
import type { UrlEntry } from "@/lib/seo/sitemap";
import type { Database } from "@/lib/db/types";
import { many, one, readPublic } from "./run";
import type { QueryError } from "./types";

/**
 * Leituras públicas do Guia Cuiabá (GUIA-T6). A RLS já corta o que não é público: só lista
 * publicada, só lugar ativo citado por lista publicada, só foto aprovada. Cache de dados por tag
 * (`guide`, `guide:list:<slug>`, `guide:venue:<slug>`), invalidado pelo Estúdio.
 */

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

const REVALIDATE = 3600;
const isSource = (s: string): s is DataSource => (DATA_SOURCES as readonly string[]).includes(s);

export const guideListHref = (slug: string) => `/guia-cuiaba/${slug}`;
export const guideVenueHref = (slug: string) => `/guia-cuiaba/lugar/${slug}`;

export interface GuidePhoto {
  src: string;
  credit: string;
  originUrl: string;
}

export interface GuideVenueView {
  id: string;
  slug: string;
  href: string;
  name: string;
  category: string;
  subcategory: string | null;
  neighborhood: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
  hours: string | null;
  priceLevel: number | null;
  rating: number | null;
  ratingCount: number | null;
  ratingSource: "tripadvisor" | "google" | "manual" | null;
  tripadvisorRank: number | null;
  tripadvisorUrl: string | null;
  /** Link do Google Maps (atribuição exigida pelos termos do Google). */
  googleMapsUrl: string | null;
  lat: number | null;
  lng: number | null;
  sources: DataSource[];
  updatedAt: string | null;
  photos: GuidePhoto[];
}

export interface GuideListSummary {
  slug: string;
  href: string;
  title: string;
  category: string;
  neighborhood: string | null;
  sponsored: boolean;
  sponsorName: string | null;
  publishedAt: string;
  refreshedAt: string;
  count: number;
  /** Os primeiros lugares, para o cartão do índice. */
  preview: string[];
}

export interface GuideListItemView {
  position: number;
  note: string | null;
  venue: GuideVenueView;
}

export interface GuideListView extends GuideListSummary {
  intro: string | null;
  criteria: string;
  dataSources: DataSource[];
  items: GuideListItemView[];
}

function toVenue(v: VenueRow, photos: GuidePhoto[]): GuideVenueView {
  return {
    id: v.id,
    slug: v.slug,
    href: guideVenueHref(v.slug),
    name: v.name,
    category: v.category,
    subcategory: v.subcategory,
    neighborhood: v.neighborhood,
    address: v.address,
    phone: v.phone,
    website: v.website,
    instagram: v.instagram,
    hours: v.hours,
    priceLevel: v.price_level,
    rating: v.rating,
    ratingCount: v.rating_count,
    ratingSource:
      v.rating_source === "tripadvisor" ||
      v.rating_source === "google" ||
      v.rating_source === "manual"
        ? v.rating_source
        : null,
    tripadvisorRank: v.tripadvisor_rank,
    tripadvisorUrl: v.tripadvisor_url,
    googleMapsUrl: v.google_maps_url,
    lat: v.lat,
    lng: v.lng,
    sources: v.data_sources.filter(isSource),
    updatedAt: v.data_updated_at,
    photos,
  };
}

type Db = Parameters<Parameters<typeof readPublic>[0]>[0];

/** Fotos aprovadas dos lugares (a RLS de `media_assets` esconde bloqueadas e reprodução desligada). */
async function photosFor(db: Db, venueIds: string[]): Promise<Map<string, GuidePhoto[]>> {
  const out = new Map<string, GuidePhoto[]>();
  if (venueIds.length === 0) return out;
  const links = await db
    .from("venue_media")
    .select("venue_id, media_id, credit, origin_url, position")
    .in("venue_id", venueIds)
    .order("position")
    .then(many);
  if (links.length === 0) return out;
  const visible = new Set(
    (
      await db
        .from("media_assets")
        .select("id")
        .in(
          "id",
          links.map((l) => l.media_id),
        )
        .then(many)
    ).map((m) => m.id),
  );
  for (const l of links) {
    if (!visible.has(l.media_id)) continue;
    const list = out.get(l.venue_id) ?? [];
    list.push({ src: mediaHref(l.media_id), credit: l.credit, originUrl: l.origin_url });
    out.set(l.venue_id, list);
  }
  return out;
}

const LIST_COLUMNS =
  "slug, title, category, neighborhood, sponsored, sponsor_name, published_at, refreshed_at";

/** Índice `/guia-cuiaba`: listas publicadas, editoriais por data e patrocinadas à parte. */
export async function listGuideLists(): Promise<
  Result<{ editorial: GuideListSummary[]; sponsored: GuideListSummary[] }, QueryError>
> {
  return readPublic(
    async (db) => {
      const rows = await db
        .from("guide_lists")
        .select(`${LIST_COLUMNS}, guide_list_items(position, venues(name))`)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(200)
        .then(many);
      const summaries = rows.map((r): GuideListSummary => {
        const items = [...(r.guide_list_items ?? [])].sort((a, b) => a.position - b.position);
        return {
          slug: r.slug,
          href: guideListHref(r.slug),
          title: r.title,
          category: r.category,
          neighborhood: r.neighborhood,
          sponsored: r.sponsored,
          sponsorName: r.sponsor_name,
          publishedAt: r.published_at ?? r.refreshed_at ?? "",
          refreshedAt: r.refreshed_at ?? r.published_at ?? "",
          count: items.length,
          preview: items.flatMap((i) => (i.venues ? [i.venues.name] : [])).slice(0, 3),
        };
      });
      return orderIndexLists(summaries);
    },
    { tags: [guideTags.index], revalidate: REVALIDATE },
  );
}

/** Uma lista publicada com os lugares, na ordem; `null` quando não existe ou não está no ar. */
export async function getGuideList(
  slug: string,
): Promise<Result<GuideListView | null, QueryError>> {
  return readPublic(
    async (db) => {
      const list = await db
        .from("guide_lists")
        .select(
          `${LIST_COLUMNS}, intro, criteria, guide_list_items(position, editor_note, venues(*))`,
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle()
        .then(one);
      if (!list) return null;
      const items = [...(list.guide_list_items ?? [])]
        .filter((i) => i.venues !== null)
        .sort((a, b) => a.position - b.position);
      const photos = await photosFor(
        db,
        items.flatMap((i) => (i.venues ? [i.venues.id] : [])),
      );
      const views = items.flatMap((i) =>
        i.venues
          ? [
              {
                position: i.position,
                note: i.editor_note,
                venue: toVenue(i.venues, photos.get(i.venues.id) ?? []),
              },
            ]
          : [],
      );
      const sources = new Set<DataSource>();
      for (const v of views) for (const s of v.venue.sources) sources.add(s);
      return {
        slug: list.slug,
        href: guideListHref(list.slug),
        title: list.title,
        category: list.category,
        neighborhood: list.neighborhood,
        sponsored: list.sponsored,
        sponsorName: list.sponsor_name,
        publishedAt: list.published_at ?? list.refreshed_at ?? "",
        refreshedAt: list.refreshed_at ?? list.published_at ?? "",
        count: views.length,
        preview: views.slice(0, 3).map((v) => v.venue.name),
        intro: list.intro,
        criteria: list.criteria,
        dataSources: [...sources],
        items: views,
      } satisfies GuideListView;
    },
    { tags: [guideTags.index, guideTags.list(slug)], revalidate: REVALIDATE },
  );
}

export interface GuideVenuePage {
  venue: GuideVenueView;
  lists: { slug: string; href: string; title: string; position: number }[];
}

/** Página do lugar: só lugar ativo citado por lista publicada (a RLS garante). */
export async function getGuideVenue(
  slug: string,
): Promise<Result<GuideVenuePage | null, QueryError>> {
  return readPublic(
    async (db) => {
      const v = await db.from("venues").select("*").eq("slug", slug).maybeSingle().then(one);
      if (!v) return null;
      const photos = await photosFor(db, [v.id]);
      const items = await db
        .from("guide_list_items")
        .select("position, guide_lists(slug, title, status, published_at)")
        .eq("venue_id", v.id)
        .then(many);
      const lists = items
        .flatMap((i) =>
          i.guide_lists && i.guide_lists.status === "published"
            ? [
                {
                  slug: i.guide_lists.slug,
                  href: guideListHref(i.guide_lists.slug),
                  title: i.guide_lists.title,
                  position: i.position,
                  at: i.guide_lists.published_at ?? "",
                },
              ]
            : [],
        )
        .sort((a, b) => b.at.localeCompare(a.at))
        .map((l) => ({ slug: l.slug, href: l.href, title: l.title, position: l.position }));
      return { venue: toVenue(v, photos.get(v.id) ?? []), lists };
    },
    { tags: [guideTags.index, guideTags.venue(slug)], revalidate: REVALIDATE },
  );
}

/** Páginas do Guia para o sitemap: índice, listas publicadas e lugares citados por elas. */
export async function listGuideEntries(): Promise<Result<UrlEntry[], QueryError>> {
  return readPublic(
    async (db) => {
      const lists = await db
        .from("guide_lists")
        .select("slug, refreshed_at, guide_list_items(venues(slug, status))")
        .eq("status", "published")
        .limit(1000)
        .then(many);
      const out: UrlEntry[] = [{ path: "/guia-cuiaba/materias" }];
      const venues = new Set<string>();
      for (const l of lists) {
        out.push({
          path: guideListHref(l.slug),
          ...(l.refreshed_at ? { lastModified: l.refreshed_at } : {}),
        });
        for (const i of l.guide_list_items ?? [])
          if (i.venues?.status === "active") venues.add(i.venues.slug);
      }
      for (const slug of venues) out.push({ path: guideVenueHref(slug) });
      return out;
    },
    { tags: ["sitemap", guideTags.index], revalidate: 300 },
  );
}
