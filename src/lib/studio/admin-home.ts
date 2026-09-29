import "server-only";
import { z } from "zod";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import {
  HOME_MODULE_IDS,
  sameLayout,
  validateHomeLayout,
  type HomeModule,
} from "@/lib/admin/home-layout";
import type { Json } from "@/lib/db/types";
import { homeLayouts } from "@/lib/db/queries/admin";
import { StudioFailure, studioAction } from "./action";

/*
 * Home e módulos (A06, P5-T8): rascunho versionado e publicação (`home_layout_publish`, 0038,
 * uma só publicada). `site.manage`; audita `home.save` / `home.publish`; publicar invalida a
 * tag `home` (o portal lê a ordem publicada).
 */

const ModulesSchema = z
  .array(z.object({ id: z.enum(HOME_MODULE_IDS), enabled: z.boolean() }))
  .min(1)
  .max(20);

const SaveInput = z.object({ modules: ModulesSchema, note: z.string().trim().max(300).optional() });
export type SaveHomeInput = z.input<typeof SaveInput>;

async function nextVersion(db: Parameters<typeof homeLayouts>[0]) {
  const { data, error } = await db!
    .from("home_layouts")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`home version: ${error.message}`);
  return (data?.version ?? 0) + 1;
}

/** Salva (ou substitui) o rascunho. Igual à publicada e sem rascunho, não cria nada. */
export const saveHomeDraftCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i, ctx) => {
    const v = validateHomeLayout(i.modules as HomeModule[]);
    if (!v.ok)
      throw new StudioFailure(
        "invalid",
        v.reason === "none_enabled" ? T.home.noneEnabled : undefined,
      );
    const current = await homeLayouts(ctx.db);
    if (!current.draft && current.published && sameLayout(current.published.modules, i.modules))
      throw new StudioFailure("conflict", T.home.unchanged);
    const modules = i.modules as unknown as NonNullable<Json>;
    if (current.draft) {
      const r = await ctx.db
        .from("home_layouts")
        .update({ modules, note: i.note ?? "" })
        .eq("id", current.draft.id)
        .select("version")
        .maybeSingle();
      if (r.error) throw new Error(`home draft: ${r.error.message}`);
      ctx.setObjectRef(`home:${current.draft.version}`);
      ctx.detail({ modules: i.modules, note: i.note });
      return { id: current.draft.id, version: current.draft.version };
    }
    const version = await nextVersion(ctx.db);
    const r = await ctx.db
      .from("home_layouts")
      .insert({ version, modules, note: i.note ?? "", created_by: ctx.userId })
      .select("id")
      .single();
    if (r.error) throw new Error(`home draft: ${r.error.message}`);
    ctx.setObjectRef(`home:${version}`);
    ctx.detail({ modules: i.modules, note: i.note });
    return { id: r.data.id, version };
  },
  { schema: SaveInput, auditAs: "home.save" },
);

export const publishHomeCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { id: string }, ctx) => {
    const { data, error } = await ctx.db.rpc("home_layout_publish", { p_id: i.id });
    if (error) {
      if (error.code === "P0002") throw new StudioFailure("not_found");
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`home publish: ${error.message}`);
    }
    const version = Number(data ?? 0);
    ctx.setObjectRef(`home:${version}`);
    ctx.detail({ version });
    await ctx.revalidate(["home"]);
    return { version };
  },
  { schema: z.object({ id: z.string().uuid() }), auditAs: "home.publish" },
);

export const discardHomeDraftCommand = studioAction(
  "site.manage",
  () => ({}),
  async (i: { id: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("home_layouts")
      .delete()
      .eq("id", i.id)
      .eq("status", "draft")
      .select("version");
    if (error) throw new Error(`home discard: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.setObjectRef(`home:${data[0]!.version}`);
    ctx.detail({ discarded: true });
    return { version: data[0]!.version };
  },
  { schema: z.object({ id: z.string().uuid() }), auditAs: "home.save" },
);
