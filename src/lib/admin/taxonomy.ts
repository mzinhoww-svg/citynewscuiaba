import "server-only";
import { z } from "zod";
import { TAXONOMY_TEXT as T } from "@/content/pt-BR/admin";
import { slugify } from "@/lib/pipeline/slug";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { studioContext } from "@/lib/studio/context";
import { suggestDuplicates, type DuplicateGroup, type TagLite } from "./tag-duplicates";

/*
 * Taxonomia (A05): editorias (nome e subeditorias), tags e mesclagem de duplicadas. A mescla passa
 * por `merge_tags` no banco (vínculos migram sem duplicar, o slug antigo vira alias). Só
 * `users.manage` (admin); a RLS de `tags`/`sections` também admite editor_chefe, sem tela por ora.
 */

export interface SectionRow {
  slug: string;
  name: string;
  parentSlug: string | null;
  autonomyCategory: string;
}

export interface TaxonomyData {
  sections: SectionRow[];
  tags: (TagLite & { slug: string })[];
  duplicates: DuplicateGroup[];
}

export async function getTaxonomy(): Promise<TaxonomyData> {
  const { db } = await studioContext();
  const [sections, tags, links] = await Promise.all([
    db.from("sections").select("slug, name, parent_slug, autonomy_category").order("name"),
    db.from("tags").select("id, slug, name").order("name"),
    db.from("article_tags").select("tag_id"),
  ]);
  if (sections.error) throw new Error(`taxonomia: ${sections.error.message}`);
  if (tags.error) throw new Error(`taxonomia: ${tags.error.message}`);
  if (links.error) throw new Error(`taxonomia: ${links.error.message}`);
  const counts = new Map<string, number>();
  for (const l of links.data ?? []) counts.set(l.tag_id, (counts.get(l.tag_id) ?? 0) + 1);
  const list = (tags.data ?? []).map((t) => ({
    id: t.id,
    slug: t.slug,
    name: t.name,
    articles: counts.get(t.id) ?? 0,
  }));
  return {
    sections: (sections.data ?? []).map((s) => ({
      slug: s.slug,
      name: s.name,
      parentSlug: s.parent_slug,
      autonomyCategory: s.autonomy_category,
    })),
    tags: list,
    duplicates: suggestDuplicates(list),
  };
}

const TagName = z.string().trim().min(2, T.errors.name).max(60, T.errors.name);
const SectionName = z.string().trim().min(2, T.errors.name).max(60, T.errors.name);

export const createTag = studioAction(
  "users.manage",
  () => ({}),
  async (input: { name: string }, ctx) => {
    const slug = slugify(input.name, 60);
    const { data, error } = await ctx.db
      .from("tags")
      .insert({ name: input.name, slug })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") throw new StudioFailure("invalid", T.errors.duplicate);
      throw new Error(`tags: ${error.message}`);
    }
    ctx.setObjectRef(`tag:${data.id}`);
    ctx.detail({ name: input.name, slug });
    return { id: data.id };
  },
  { schema: z.object({ name: TagName }), objectRef: () => "tag:nova", auditAs: "tag.create" },
);

export const renameTag = studioAction(
  "users.manage",
  () => ({}),
  async (input: { id: string; name: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("tags")
      .update({ name: input.name })
      .eq("id", input.id)
      .select("id");
    if (error) throw new Error(`tags: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ name: input.name });
    return { id: input.id };
  },
  {
    schema: z.object({ id: z.string().uuid(), name: TagName }),
    objectRef: (i) => `tag:${i.id}`,
    auditAs: "tag.rename",
  },
);

export const deleteTag = studioAction(
  "users.manage",
  () => ({}),
  async (input: { id: string }, ctx) => {
    const links = await ctx.db
      .from("article_tags")
      .select("article_id", { count: "exact", head: true })
      .eq("tag_id", input.id);
    if (links.error) throw new Error(`tags: ${links.error.message}`);
    if ((links.count ?? 0) > 0) throw new StudioFailure("invalid", T.errors.notEmpty);
    const { data, error } = await ctx.db.from("tags").delete().eq("id", input.id).select("id");
    if (error) throw new Error(`tags: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    return { id: input.id };
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    objectRef: (i) => `tag:${i.id}`,
    auditAs: "tag.delete",
  },
);

export const mergeTags = studioAction(
  "users.manage",
  () => ({}),
  async (input: { fromId: string; intoId: string }, ctx) => {
    if (input.fromId === input.intoId) throw new StudioFailure("invalid", T.errors.same);
    const { data, error } = await ctx.db.rpc("merge_tags", {
      p_from: input.fromId,
      p_into: input.intoId,
    });
    if (error) {
      if (error.code === "P0002") throw new StudioFailure("not_found");
      if (error.code === "22023") throw new StudioFailure("invalid", T.errors.same);
      throw new Error(`tags: ${error.message}`);
    }
    ctx.detail({ from: input.fromId, into: input.intoId, moved: data });
    return { moved: data };
  },
  {
    schema: z.object({ fromId: z.string().uuid(), intoId: z.string().uuid() }),
    objectRef: (i) => `tag:${i.intoId}`,
    auditAs: "tag.merge",
  },
);

export const renameSection = studioAction(
  "users.manage",
  () => ({}),
  async (input: { slug: string; name: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("sections")
      .update({ name: input.name })
      .eq("slug", input.slug)
      .select("slug");
    if (error) throw new Error(`editorias: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ name: input.name });
    await ctx.revalidate(["home", "sections"]);
    return { slug: input.slug };
  },
  {
    schema: z.object({ slug: z.string().regex(/^[a-z0-9-]{2,40}$/), name: SectionName }),
    objectRef: (i) => `section:${i.slug}`,
    auditAs: "section.rename",
  },
);

/** Subeditoria nova dentro de uma editoria principal; herda a categoria de autonomia dela. */
export const createSubsection = studioAction(
  "users.manage",
  () => ({}),
  async (input: { name: string; parentSlug: string }, ctx) => {
    const parent = await ctx.db
      .from("sections")
      .select("slug, parent_slug, autonomy_category")
      .eq("slug", input.parentSlug)
      .maybeSingle();
    if (parent.error) throw new Error(`editorias: ${parent.error.message}`);
    if (!parent.data || parent.data.parent_slug !== null) throw new StudioFailure("not_found");
    const slug = slugify(input.name, 40);
    const { error } = await ctx.db.from("sections").insert({
      slug,
      name: input.name,
      parent_slug: parent.data.slug,
      autonomy_category: parent.data.autonomy_category,
    });
    if (error) {
      if (error.code === "23505") throw new StudioFailure("invalid", T.errors.duplicate);
      throw new Error(`editorias: ${error.message}`);
    }
    ctx.setObjectRef(`section:${slug}`);
    ctx.detail({ name: input.name, parent: input.parentSlug });
    await ctx.revalidate(["home", "sections"]);
    return { slug };
  },
  {
    schema: z.object({ name: SectionName, parentSlug: z.string().regex(/^[a-z0-9-]{2,40}$/) }),
    objectRef: () => "section:nova",
    auditAs: "section.create",
  },
);
