import "server-only";
import { z } from "zod";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { SLUG_RE, slugify } from "@/lib/admin/taxonomy";
import { StudioFailure, studioAction } from "./action";

/*
 * Taxonomia (A05, P5-T8): subeditorias, renomear editoria, lugares e mesclagem de tags.
 * `site.manage` (admin e editor-chefe); a RLS de `sections`/`places` confere de novo.
 * Mesclar tags preserva vínculos (`taxonomy_merge_tags`, 0038) e audita as duas tags.
 */

const revalidate = (ctx: { revalidate: (tags: string[]) => Promise<void> }) =>
  ctx.revalidate(["home", "sections", "sitemap"]);

export const createSectionCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { name: string; parentSlug: string }, ctx) => {
    const slug = slugify(i.name);
    if (!SLUG_RE.test(slug)) throw new StudioFailure("invalid");
    const parent = await ctx.db
      .from("sections")
      .select("slug, autonomy_category, parent_slug")
      .eq("slug", i.parentSlug)
      .maybeSingle();
    if (parent.error) throw new Error(`section parent: ${parent.error.message}`);
    if (!parent.data || parent.data.parent_slug) throw new StudioFailure("not_found");
    const r = await ctx.db.from("sections").insert({
      slug,
      name: i.name.trim(),
      parent_slug: i.parentSlug,
      autonomy_category: parent.data.autonomy_category,
    });
    if (r.error) {
      if (r.error.code === "23505")
        throw new StudioFailure("conflict", T.taxonomy.sectionDialog.slugTaken);
      throw new Error(`section: ${r.error.message}`);
    }
    ctx.setObjectRef(`section:${slug}`);
    ctx.detail({ name: i.name, parentSlug: i.parentSlug });
    await revalidate(ctx);
    return { slug };
  },
  {
    schema: z.object({
      name: z.string().trim().min(2).max(60),
      parentSlug: z.string().regex(SLUG_RE),
    }),
    auditAs: "taxonomy.save",
  },
);

export const renameSectionCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { slug: string; name: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("sections")
      .update({ name: i.name.trim() })
      .eq("slug", i.slug)
      .select("slug");
    if (error) throw new Error(`section rename: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ name: i.name });
    await revalidate(ctx);
    return { slug: i.slug };
  },
  {
    schema: z.object({ slug: z.string().regex(SLUG_RE), name: z.string().trim().min(2).max(60) }),
    auditAs: "taxonomy.save",
    objectRef: (i) => `section:${i.slug}`,
  },
);

const PlaceInput = z.object({
  name: z.string().trim().min(2).max(80),
  kind: z.enum(["bairro", "municipio"]),
  inPhrase: z.string().trim().min(2).max(100),
});

export const createPlaceCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i, ctx) => {
    const slug = slugify(i.name);
    if (!SLUG_RE.test(slug)) throw new StudioFailure("invalid");
    const r = await ctx.db
      .from("places")
      .insert({ slug, name: i.name, kind: i.kind, in_phrase: i.inPhrase });
    if (r.error) {
      if (r.error.code === "23505")
        throw new StudioFailure("conflict", T.taxonomy.placeDialog.slugTaken);
      throw new Error(`place: ${r.error.message}`);
    }
    ctx.setObjectRef(`place:${slug}`);
    ctx.detail(i);
    return { slug };
  },
  { schema: PlaceInput, auditAs: "taxonomy.save" },
);

export const togglePlaceCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { slug: string; active: boolean }, ctx) => {
    const { data, error } = await ctx.db
      .from("places")
      .update({ active: i.active, updated_at: new Date().toISOString() })
      .eq("slug", i.slug)
      .select("name");
    if (error) throw new Error(`place: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ active: i.active });
    return { name: data[0]!.name };
  },
  {
    schema: z.object({ slug: z.string().regex(SLUG_RE), active: z.boolean() }),
    auditAs: "taxonomy.save",
    objectRef: (i) => `place:${i.slug}`,
  },
);

const MergeInput = z.object({
  from: z.string().trim().min(1).max(80),
  into: z.string().trim().min(1).max(80),
});

export const mergeTagsCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i, ctx) => {
    if (i.from === i.into) throw new StudioFailure("invalid");
    const { data, error } = await ctx.db.rpc("taxonomy_merge_tags", {
      p_from: i.from,
      p_into: i.into,
    });
    if (error) {
      // 0048: tag de tema sensível não some para uma tag comum (retenção da publicação automática).
      if (error.code === "42501" && /sens[ií]vel/.test(error.message))
        throw new StudioFailure("invalid", T.taxonomy.mergeSensitive(i.from));
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`merge tags: ${error.message}`);
    }
    const n = Number(data ?? 0);
    ctx.detail({ from: i.from, into: i.into, links: n });
    await revalidate(ctx);
    return { links: n };
  },
  { schema: MergeInput, auditAs: "taxonomy.merge", objectRef: (i) => `tag:${i.into}` },
);
