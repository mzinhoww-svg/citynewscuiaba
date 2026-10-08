import "server-only";
import { z } from "zod";
import { GUIDE_ADMIN_TEXT as T } from "@/content/pt-BR/guide";
import { canAccess, type Action, type Scope } from "@/lib/auth/permissions";
import { createGuideListStore, REFRESH_DAYS } from "@/lib/db/guide-list-store";
import { createGuideStore, venueSlugBase } from "@/lib/db/guide-store";
import { proposeForTemplate } from "@/lib/guide/engine";
import { extractFromLink } from "@/lib/guide/extract-link";
import { guideTags, takedownVenuePhoto } from "@/lib/guide/venue-media";
import { isSameVenue, mergeVenueLists } from "@/lib/guide/merge";
import { buildProviders } from "@/lib/guide/providers/factory";
import { CITY, MIN_LINK_VENUES, proposeFromLink, signalsOf } from "@/lib/guide/proposals";
import { rankList } from "@/lib/guide/rank";
import { DEFAULT_WEIGHTS, scoreVenue } from "@/lib/guide/score";
import { verifyNames } from "@/lib/guide/verify-names";
import { listCriteriaText } from "@/lib/guide/criteria";
import type { GuideItem, GuideTemplate, Venue, VenueRecord } from "@/lib/guide/types";
import { MIN_CRITERIA_CHARS } from "@/lib/guide/auto-publish";
import { crawlDeps } from "@/lib/sources/http-deps";
import {
  studioAction,
  StudioFailure,
  type ActionContext,
  type StudioActionOptions,
  type StudioResult,
} from "./action";
import { GUIDE_SECTION } from "./guide-scope";
import { studioContext, type StudioContext } from "./context";

/*
 * Comandos do admin do Guia Cuiabá (GUIA-T5). Quem tem `site.manage` (admin, editor-chefe) ou
 * `article.edit` na editoria guia-cuiaba (editor) gerencia propostas e listas; modelos, lugares,
 * patrocínio e reclamações exigem `site.manage`. Toda ação é auditada (`guide.*`).
 */

const DAY = 86_400_000;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const Id = z.object({ id: z.uuid() });
type Id = z.infer<typeof Id>;

/** `site.manage` quando a pessoa tem; senão `article.edit` com o escopo da editoria do Guia. */
function listAction<I, O>(
  fn: (input: I, ctx: ActionContext) => Promise<O>,
  options: StudioActionOptions<I>,
): (input: I) => Promise<StudioResult<O>> {
  return async (raw: I) => {
    const ctx = await studioContext();
    const roles = ctx.session?.roles ?? [];
    const action: Action = canAccess(roles, "site.manage") ? "site.manage" : "article.edit";
    const scopeOf = (): Scope => (action === "article.edit" ? { section: GUIDE_SECTION } : {});
    return studioAction<I, O>(action, scopeOf, fn, options)(raw);
  };
}

/** Caminhos do público que mostram a lista e os lugares dela. */
async function listTags(
  ctx: StudioContext,
  listId: string,
): Promise<{ slug: string; tags: string[] } | null> {
  const store = createGuideListStore(ctx.db);
  const l = await store.getList(listId);
  if (!l) return null;
  return {
    slug: l.slug,
    tags: [
      guideTags.index,
      guideTags.list(l.slug),
      ...l.items.map((i) => guideTags.venue(i.venue.slug)),
      "sitemap",
    ],
  };
}

// ---------------------------------------------------------------------------
// Propor por link
// ---------------------------------------------------------------------------
const LinkInput = z.object({
  url: z
    .string()
    .trim()
    .max(500)
    .regex(/^https?:\/\//i, T.errors.linkScheme),
  category: z.string().regex(SLUG).max(40).nullable().optional(),
});
export type LinkInput = z.infer<typeof LinkInput>;

export const proposeFromLinkCommand = listAction(
  async (i: LinkInput, ctx) => {
    const { createServiceClient } = await import("@/lib/db/client");
    const { createIngestRepo } = await import("@/lib/db/pipeline-store");
    const crawl = crawlDeps({ repo: createIngestRepo(createServiceClient()) });

    const ex = await extractFromLink(i.url, { crawl });
    if (!ex.ok) throw new StudioFailure("invalid", T.errors.extract[ex.error]);

    const providers = buildProviders();
    const category = i.category ?? ex.value.category ?? undefined;
    const checked = await verifyNames(
      ex.value.names,
      [providers.osm, ...(providers.tripadvisor ? [providers.tripadvisor] : [])],
      { area: CITY, ...(category ? { category } : {}) },
    );
    const verified = checked.flatMap((c) => (c.status === "verified" && c.record ? [c] : []));
    if (verified.length < MIN_LINK_VENUES)
      throw new StudioFailure("invalid", T.errors.tooFew(verified.length, ex.value.names.length));

    const cat = category ?? verified[0]?.record?.category ?? "restaurante";
    const venueStore = createGuideStore(ctx.db);
    const lists = createGuideListStore(ctx.db);
    const existing = await venueStore.loadCategory(cat);
    const merged = mergeVenueLists(
      existing,
      verified.map((v) => ({ ...(v.record as VenueRecord), category: cat })),
    );
    await venueStore.save(
      {
        inserts: merged.inserts,
        updates: merged.updates.map((u) => ({
          id: u.existing.id,
          record: u.record,
          ratingChecked: u.record.sources.includes("tripadvisor"),
        })),
      },
      ctx.now(),
    );
    const after = await venueStore.loadCategory(cat);
    const venues = verified.flatMap((v) => {
      const found = after.find((a) => isSameVenue(a, v.record as VenueRecord));
      return found ? [found] : [];
    });
    const mentions = await lists.mentions(venues);
    const r = proposeFromLink({
      url: i.url,
      extracted: ex.value,
      verifiedNames: verified.map((v) => v.name),
      venues,
      category: cat,
      mentions,
    });
    if (!r.ok)
      throw new StudioFailure("invalid", T.errors.tooFew(venues.length, ex.value.names.length));
    const created = await lists.createProposal({
      proposal: r.proposal,
      templateId: "",
      analysis: r.analysis as unknown as Record<string, unknown>,
      sourceUrl: i.url,
      createdBy: ctx.userId,
    });
    ctx.setObjectRef(`guide_list:${created.listId}`);
    ctx.detail({
      origin: "link",
      host: r.analysis.sourceHost,
      extracted: r.analysis.extractedNames.length,
      verified: r.analysis.verifiedNames.length,
      discarded: r.analysis.discardedNames.length,
    });
    return {
      listId: created.listId,
      verified: r.analysis.verifiedNames.length,
      discarded: r.analysis.discardedNames,
    };
  },
  { schema: LinkInput, auditAs: "guide.propose" },
);

// ---------------------------------------------------------------------------
// Propor manualmente
// ---------------------------------------------------------------------------
const ManualInput = z.object({
  title: z.string().trim().min(8, T.errors.title).max(160, T.errors.title),
  category: z.string().regex(SLUG, T.errors.category).max(40),
  neighborhood: z.string().trim().max(80).nullable().optional(),
  venueIds: z.array(z.uuid()).min(MIN_LINK_VENUES, T.errors.minVenues).max(20),
  criteria: z.string().trim().max(1200).optional(),
});
export type ManualInput = z.infer<typeof ManualInput>;

function rankedItems(
  venues: readonly Venue[],
  mentions: ReadonlyMap<string, number>,
  order?: readonly string[],
) {
  const scored = venues.map((v) => {
    const s = scoreVenue(signalsOf(v, mentions.get(v.id) ?? 0), DEFAULT_WEIGHTS);
    return {
      venueId: v.id,
      name: v.name,
      score: s.score,
      breakdown: s.breakdown as Record<string, number>,
    };
  });
  if (!order) return rankList(scored, scored.length);
  const byId = new Map(scored.map((s) => [s.venueId, s]));
  return order.flatMap((id, i) => {
    const s = byId.get(id);
    return s ? [{ ...s, position: i + 1 }] : [];
  });
}

export const proposeManualCommand = listAction(
  async (i: ManualInput, ctx) => {
    const lists = createGuideListStore(ctx.db);
    const venues = await lists.venuesByIds(i.venueIds);
    if (venues.length !== new Set(i.venueIds).size)
      throw new StudioFailure("not_found", T.errors.venueMissing);
    if (venues.some((v) => v.status !== "active"))
      throw new StudioFailure("invalid", T.errors.venueInactive);
    const mentions = await lists.mentions(venues);
    const ranked = rankedItems(venues, mentions);
    const take = Math.min(ranked.length, 20);
    const tpl: GuideTemplate = {
      slug: "",
      title: i.title,
      category: i.category,
      subcategory: null,
      neighborhood: i.neighborhood ?? null,
      take,
      minVenues: MIN_LINK_VENUES,
    };
    const items: GuideItem[] = ranked.map((r) => ({
      position: r.position,
      venueId: r.venueId,
      score: r.score,
      breakdown: r.breakdown,
      editorNote: null,
    }));
    const sources = [...new Set(venues.flatMap((v) => v.sources))];
    const created = await lists.createProposal({
      proposal: {
        origin: "manual",
        title: i.title,
        slug: "",
        category: i.category,
        subcategory: null,
        neighborhood: i.neighborhood ?? null,
        criteria: i.criteria?.trim() || listCriteriaText(tpl, DEFAULT_WEIGHTS),
        take,
        templateSlug: null,
        items,
        dataSources: sources,
      },
      templateId: "",
      analysis: { origin: "manual", venues: venues.length },
      createdBy: ctx.userId,
    });
    ctx.setObjectRef(`guide_list:${created.listId}`);
    ctx.detail({ origin: "manual", venues: venues.length });
    return { listId: created.listId };
  },
  { schema: ManualInput, auditAs: "guide.propose" },
);

// ---------------------------------------------------------------------------
// Propor agora (um modelo do catálogo)
// ---------------------------------------------------------------------------
export const proposeTemplateNowCommand = listAction(
  async (i: Id, ctx) => {
    const lists = createGuideListStore(ctx.db);
    const { data, error } = await ctx.db
      .from("guide_templates")
      .select("*")
      .eq("id", i.id)
      .maybeSingle();
    if (error) throw new Error(`modelo: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    const { templateFromRow } = await import("@/lib/db/guide-list-store");
    const out = await proposeForTemplate(
      { store: lists, now: ctx.now },
      templateFromRow(data),
      ctx.userId,
    );
    if (out.status === "none") throw new StudioFailure("invalid", T.errors.notEnoughVenues);
    ctx.setObjectRef(`guide_list:${out.listId}`);
    ctx.detail({ origin: "template", template: out.template, items: out.items });
    return { listId: out.listId };
  },
  { schema: Id, auditAs: "guide.propose" },
);

// ---------------------------------------------------------------------------
// Ajustar, publicar, descartar, suspender e reativar
// ---------------------------------------------------------------------------
const AdjustInput = z.object({
  id: z.uuid(),
  title: z.string().trim().min(8, T.errors.title).max(160, T.errors.title),
  // O texto de abertura escrito pelo Guia tem até 4.000 caracteres (A-214).
  intro: z.string().trim().max(4000).nullable().optional(),
  criteria: z.string().trim().max(1200),
  items: z
    .array(z.object({ venueId: z.uuid(), note: z.string().trim().max(400).nullable().optional() }))
    .min(MIN_LINK_VENUES, T.errors.minVenues)
    .max(20),
});
export type AdjustInput = z.infer<typeof AdjustInput>;

export const adjustListCommand = listAction(
  async (i: AdjustInput, ctx) => {
    const lists = createGuideListStore(ctx.db);
    const list = await lists.getList(i.id);
    if (!list) throw new StudioFailure("not_found");
    if (list.status === "discarded") throw new StudioFailure("conflict", T.errors.discarded);
    const ids = i.items.map((x) => x.venueId);
    if (new Set(ids).size !== ids.length) throw new StudioFailure("invalid", T.errors.duplicate);
    const venues = await lists.venuesByIds(ids);
    if (venues.length !== ids.length) throw new StudioFailure("not_found", T.errors.venueMissing);
    if (list.status === "published" && venues.some((v) => v.status !== "active"))
      throw new StudioFailure("invalid", T.errors.venueInactive);
    if (list.status === "published" && i.criteria.trim().length < MIN_CRITERIA_CHARS)
      throw new StudioFailure("invalid", T.errors.criteria);
    const mentions = await lists.mentions(venues);
    const ranked = rankedItems(venues, mentions, ids);
    const notes = new Map(i.items.map((x) => [x.venueId, x.note?.trim() || null]));
    const items: GuideItem[] = ranked.map((r) => ({
      position: r.position,
      venueId: r.venueId,
      score: r.score,
      breakdown: r.breakdown,
      editorNote: notes.get(r.venueId) ?? null,
    }));
    const up = await ctx.db
      .from("guide_lists")
      .update({
        title: i.title,
        intro: i.intro?.trim() || null,
        // Quem ajusta passa a ser o dono do texto: o Guia não o reescreve mais (A-214).
        intro_auto: false,
        criteria: i.criteria.trim(),
        take: Math.min(Math.max(items.length, 3), 20),
      })
      .eq("id", i.id);
    if (up.error) throw new Error(`ajustar lista: ${up.error.message}`);
    await lists.replaceItems(i.id, items);
    const own = await ctx.db
      .from("guide_list_items")
      .update({ note_auto: false })
      .eq("list_id", i.id);
    if (own.error) throw new Error(`ajustar lista: ${own.error.message}`);
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({ items: items.length, status: list.status });
    const t = await listTags(ctx, i.id);
    if (list.status === "published" && t) await ctx.revalidate(t.tags);
    return { id: i.id };
  },
  { schema: AdjustInput, auditAs: "guide.adjust" },
);

export const publishListCommand = listAction(
  async (i: Id, ctx) => {
    const lists = createGuideListStore(ctx.db);
    const list = await lists.getList(i.id);
    if (!list) throw new StudioFailure("not_found");
    if (list.status !== "proposal" && list.status !== "draft")
      throw new StudioFailure("conflict", T.errors.notPublishable);
    // Lista nunca publica sem "Como escolhemos" nem com lugar fora do ar (Global Constraints).
    if (list.criteria.trim().length < MIN_CRITERIA_CHARS)
      throw new StudioFailure("invalid", T.errors.criteria);
    if (list.items.length < MIN_LINK_VENUES) throw new StudioFailure("invalid", T.errors.minVenues);
    if (list.items.some((it) => it.venue.status !== "active"))
      throw new StudioFailure("invalid", T.errors.venueInactive);
    const now = ctx.now();
    const up = await ctx.db
      .from("guide_lists")
      .update({
        status: "published",
        published_at: now.toISOString(),
        refreshed_at: now.toISOString(),
        next_refresh_at: new Date(now.getTime() + REFRESH_DAYS * DAY).toISOString(),
        published_by: ctx.userId,
        suspended_at: null,
        suspended_reason: null,
      })
      .eq("id", i.id);
    if (up.error) throw new Error(`publicar lista: ${up.error.message}`);
    await ctx.db
      .from("guide_proposals")
      .update({ status: "published", decided_by: ctx.userId, decided_at: now.toISOString() })
      .eq("list_id", i.id)
      .eq("status", "open");
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({
      slug: list.slug,
      items: list.items.length,
      origin: list.origin,
      sponsored: list.sponsored,
    });
    await ctx.revalidate([
      guideTags.index,
      guideTags.list(list.slug),
      ...list.items.map((it) => guideTags.venue(it.venue.slug)),
      "sitemap",
    ]);
    return { slug: list.slug };
  },
  { schema: Id, auditAs: "guide.publish" },
);

const DiscardInput = z.object({
  id: z.uuid(),
  reason: z.string().trim().min(3, T.errors.reason).max(300),
});
export type DiscardInput = z.infer<typeof DiscardInput>;

export const discardListCommand = listAction(
  async (i: DiscardInput, ctx) => {
    const { data, error } = await ctx.db
      .from("guide_lists")
      .select("status, slug")
      .eq("id", i.id)
      .maybeSingle();
    if (error) throw new Error(`descartar lista: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    if (data.status !== "proposal" && data.status !== "draft")
      throw new StudioFailure("conflict", T.errors.notDiscardable);
    const up = await ctx.db.from("guide_lists").update({ status: "discarded" }).eq("id", i.id);
    if (up.error) throw new Error(`descartar lista: ${up.error.message}`);
    await ctx.db
      .from("guide_proposals")
      .update({
        status: "discarded",
        decision_note: i.reason,
        decided_by: ctx.userId,
        decided_at: ctx.now().toISOString(),
      })
      .eq("list_id", i.id)
      .eq("status", "open");
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({ reason: i.reason, slug: data.slug });
    return { id: i.id };
  },
  { schema: DiscardInput, auditAs: "guide.discard" },
);

export const suspendListCommand = listAction(
  async (i: DiscardInput, ctx) => {
    const { data, error } = await ctx.db
      .from("guide_lists")
      .select("status, slug")
      .eq("id", i.id)
      .maybeSingle();
    if (error) throw new Error(`suspender lista: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    if (data.status !== "published") throw new StudioFailure("conflict", T.errors.notSuspendable);
    const up = await ctx.db
      .from("guide_lists")
      .update({
        status: "suspended",
        suspended_at: ctx.now().toISOString(),
        suspended_reason: `editor: ${i.reason}`,
      })
      .eq("id", i.id);
    if (up.error) throw new Error(`suspender lista: ${up.error.message}`);
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({ reason: i.reason, slug: data.slug });
    const t = await listTags(ctx, i.id);
    if (t) await ctx.revalidate(t.tags);
    return { id: i.id };
  },
  { schema: DiscardInput, auditAs: "guide.suspend" },
);

export const restoreListCommand = listAction(
  async (i: Id, ctx) => {
    const lists = createGuideListStore(ctx.db);
    const list = await lists.getList(i.id);
    if (!list) throw new StudioFailure("not_found");
    if (list.status !== "suspended") throw new StudioFailure("conflict", T.errors.notRestorable);
    if (list.items.some((it) => it.venue.status !== "active"))
      throw new StudioFailure("invalid", T.errors.venueInactive);
    const up = await ctx.db
      .from("guide_lists")
      .update({ status: "published", suspended_at: null, suspended_reason: null })
      .eq("id", i.id);
    if (up.error) throw new Error(`reativar lista: ${up.error.message}`);
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({ slug: list.slug });
    const t = await listTags(ctx, i.id);
    if (t) await ctx.revalidate(t.tags);
    return { id: i.id };
  },
  { schema: Id, auditAs: "guide.restore" },
);

// ---------------------------------------------------------------------------
// Patrocinado: só CityNews e parceiros; nunca mexe na ordem (Review Focus 5)
// ---------------------------------------------------------------------------
const SponsorInput = z.discriminatedUnion("sponsored", [
  z.object({ id: z.uuid(), sponsored: z.literal(false) }),
  z.object({
    id: z.uuid(),
    sponsored: z.literal(true),
    sponsorKind: z.enum(["citynews", "partner"], T.errors.sponsorKind),
    sponsorName: z.string().trim().min(2, T.errors.sponsorName).max(80, T.errors.sponsorName),
  }),
]);
export type SponsorInput = z.infer<typeof SponsorInput>;

export const setSponsorCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: SponsorInput, ctx) => {
    const { data, error } = await ctx.db
      .from("guide_lists")
      .select("status, slug")
      .eq("id", i.id)
      .maybeSingle();
    if (error) throw new Error(`patrocínio: ${error.message}`);
    if (!data) throw new StudioFailure("not_found");
    // Só estes três campos mudam: itens, posições e pontuações não são tocados.
    const patch = i.sponsored
      ? {
          sponsored: true,
          sponsor_kind: i.sponsorKind,
          sponsor_name: i.sponsorKind === "citynews" ? "CityNews" : i.sponsorName,
        }
      : { sponsored: false, sponsor_kind: null, sponsor_name: null };
    const up = await ctx.db.from("guide_lists").update(patch).eq("id", i.id);
    if (up.error) throw new Error(`patrocínio: ${up.error.message}`);
    ctx.setObjectRef(`guide_list:${i.id}`);
    ctx.detail({ sponsored: i.sponsored, ...(i.sponsored ? { kind: i.sponsorKind } : {}) });
    const t = await listTags(ctx, i.id);
    if (data.status === "published" && t) await ctx.revalidate(t.tags);
    return { id: i.id };
  },
  { schema: SponsorInput, auditAs: "guide.sponsor" },
);

// ---------------------------------------------------------------------------
// Lugares e modelos (site.manage)
// ---------------------------------------------------------------------------
const opt = (max: number) => z.string().trim().max(max).nullable().optional();
const VenueInput = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2, T.errors.venueName).max(160),
  category: z.string().regex(SLUG, T.errors.category).max(40),
  subcategory: opt(40),
  neighborhood: opt(80),
  address: opt(200),
  phone: opt(40),
  website: z
    .string()
    .trim()
    .max(300)
    .regex(/^https?:\/\//i, T.errors.website)
    .nullable()
    .optional()
    .or(z.literal("")),
  instagram: opt(200),
  hours: opt(300),
  status: z.enum(["active", "inactive"]),
});
export type VenueInput = z.infer<typeof VenueInput>;

export const saveVenueCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: VenueInput, ctx) => {
    const clean = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);
    const fields = {
      name: i.name,
      category: i.category,
      subcategory: clean(i.subcategory),
      neighborhood: clean(i.neighborhood),
      address: clean(i.address),
      phone: clean(i.phone),
      website: clean(i.website),
      instagram: clean(i.instagram),
      hours: clean(i.hours),
    };
    if (i.id) {
      const { data, error } = await ctx.db
        .from("venues")
        .select("data_sources")
        .eq("id", i.id)
        .maybeSingle();
      if (error) throw new Error(`lugar: ${error.message}`);
      if (!data) throw new StudioFailure("not_found");
      const sources = [...new Set([...data.data_sources, "manual"])];
      const up = await ctx.db
        .from("venues")
        .update({
          ...fields,
          status: i.status,
          status_reason: i.status === "inactive" ? "retirado pelo Estúdio" : null,
          data_sources: sources,
          data_updated_at: ctx.now().toISOString(),
        })
        .eq("id", i.id);
      if (up.error) throw new Error(`lugar: ${up.error.message}`);
      ctx.setObjectRef(`venue:${i.id}`);
      ctx.detail({ name: i.name, status: i.status });
      await ctx.revalidate([guideTags.index]);
      return { id: i.id };
    }
    const store = createGuideStore(ctx.db);
    const record: VenueRecord = {
      ...fields,
      lat: null,
      lng: null,
      priceLevel: null,
      rating: null,
      ratingCount: null,
      ratingSource: null,
      tripadvisorRank: null,
      tripadvisorUrl: null,
      googleMapsUrl: null,
      googleType: null,
      placeIds: {},
      sources: ["manual"],
    };
    await store.save({ inserts: [record], updates: [] }, ctx.now());
    const slugBase = venueSlugBase(record);
    const { data } = await ctx.db
      .from("venues")
      .select("id")
      .like("slug", `${slugBase}%`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    ctx.setObjectRef(`venue:${data?.id ?? slugBase}`);
    ctx.detail({ name: i.name, created: true });
    return { id: data?.id ?? "" };
  },
  { schema: VenueInput, auditAs: "guide.venue.save", objectRef: (i) => `venue:${i.id ?? "novo"}` },
);

const TemplateInput = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(8, T.errors.title).max(160),
  noun: z.string().trim().min(3).max(80),
  category: z.string().regex(SLUG, T.errors.category).max(40),
  subcategory: opt(40),
  neighborhood: opt(80),
  take: z.number().int().min(3).max(20),
  minVenues: z.number().int().min(3).max(20),
  active: z.boolean(),
});
export type TemplateInput = z.infer<typeof TemplateInput>;

export const saveTemplateCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: TemplateInput, ctx) => {
    const { slugify } = await import("@/lib/pipeline/slug");
    const row = {
      title: i.title,
      noun: i.noun,
      category: i.category,
      subcategory: i.subcategory?.trim() || null,
      neighborhood: i.neighborhood?.trim() || null,
      take: i.take,
      min_venues: i.minVenues,
      active: i.active,
    };
    const saved = i.id
      ? await ctx.db.from("guide_templates").update(row).eq("id", i.id).select("id").maybeSingle()
      : await ctx.db
          .from("guide_templates")
          .insert({ ...row, slug: slugify(i.title, 100) })
          .select("id")
          .single();
    if (saved.error) {
      if (saved.error.code === "23505")
        throw new StudioFailure("conflict", T.errors.templateExists);
      throw new Error(`modelo: ${saved.error.message}`);
    }
    if (!saved.data) throw new StudioFailure("not_found");
    ctx.setObjectRef(`guide_template:${saved.data.id}`);
    ctx.detail({ title: i.title, active: i.active });
    return { id: saved.data.id };
  },
  {
    schema: TemplateInput,
    auditAs: "guide.template.save",
    objectRef: (i) => `guide_template:${i.id ?? "novo"}`,
  },
);

// ---------------------------------------------------------------------------
// Reclamações e retirada de foto
// ---------------------------------------------------------------------------
const ReportDecision = z.object({
  id: z.uuid(),
  decision: z.enum(["dismiss", "confirm"]),
  note: z.string().trim().max(400).optional(),
});
export type ReportDecision = z.infer<typeof ReportDecision>;

export const decideReportCommand = listAction(
  async (i: ReportDecision, ctx) => {
    const { data, error } = await ctx.db.rpc("guide_resolve_report", {
      p_report: i.id,
      p_decision: i.decision,
      ...(i.note ? { p_note: i.note } : {}),
    });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      if (error.code === "P0002") throw new StudioFailure("not_found");
      if (error.code === "22023") throw new StudioFailure("conflict", T.errors.reportDecided);
      throw new Error(`reclamação: ${error.message}`);
    }
    const restored = ((data as { restoredLists?: string[] } | null)?.restoredLists ?? []).filter(
      (s) => typeof s === "string",
    );
    ctx.setObjectRef(`venue_report:${i.id}`);
    ctx.detail({ decision: i.decision, restored });
    await ctx.revalidate([guideTags.index, "sitemap", ...restored.map(guideTags.list)]);
    return { restored };
  },
  {
    schema: ReportDecision,
    auditAs: "guide.report.decide",
    objectRef: (i) => `venue_report:${i.id}`,
  },
);

const PhotoTakedown = z.object({
  mediaId: z.uuid(),
  reason: z.string().trim().min(3, T.errors.reason).max(300),
});
export type PhotoTakedown = z.infer<typeof PhotoTakedown>;

export const takedownVenuePhotoCommand = studioAction(
  "media.approve",
  () => ({}),
  async (i: PhotoTakedown, ctx) => {
    const [
      { createServiceClient },
      { createMediaRepo },
      { createVenueMediaRepo },
      { productionMediaStore },
    ] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/pipeline-store"),
      import("@/lib/db/guide-media-store"),
      import("@/lib/pipeline/deps"),
    ]);
    const service = createServiceClient();
    const r = await takedownVenuePhoto(
      {
        repo: createMediaRepo(service),
        store: ctx.mediaStore ?? productionMediaStore(service),
        revalidate: ctx.revalidate,
        now: ctx.now,
        venuesOfMedia: createVenueMediaRepo(service).venuesOfMedia,
      },
      i.mediaId,
      ctx.userId,
      i.reason,
    );
    if (!r.ok)
      throw new StudioFailure(r.error === "not_found" ? "not_found" : "invalid", T.errors.reason);
    ctx.detail({
      reason: i.reason,
      blocked: r.value.blocked,
      venues: r.value.venues,
      lists: r.value.lists,
    });
    return r.value;
  },
  {
    schema: PhotoTakedown,
    objectRef: (i) => `media:${i.mediaId}`,
    auditAs: "media.takedown.request",
  },
);
