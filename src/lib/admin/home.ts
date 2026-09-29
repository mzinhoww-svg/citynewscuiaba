import "server-only";
import { z } from "zod";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { studioContext } from "@/lib/studio/context";
import { HOME_MODULE_KEYS, normalizeModules, type HomeModule } from "@/lib/home/modules";

/*
 * Editor da home (A06): um rascunho e uma versão publicada por vez. O rascunho só existe para o
 * Estúdio; a home pública lê a publicada (getPublishedHomeModules) e, sem ela, o layout padrão.
 * Publicar chama `home_publish` (arquiva a anterior, apaga o rascunho, cria a versão nova) e
 * invalida a tag `home`.
 */
export type HomeEditorState = {
  modules: HomeModule[];
  source: "draft" | "published" | "default";
  publishedVersion: number | null;
};

export async function getHomeEditorState(): Promise<HomeEditorState> {
  const { db } = await studioContext();
  const { data, error } = await db
    .from("home_layouts")
    .select("version, status, modules")
    .in("status", ["draft", "published"]);
  if (error) throw new Error(`home: ${error.message}`);
  const rows = data ?? [];
  const draft = rows.find((r) => r.status === "draft");
  const pub = rows.find((r) => r.status === "published");
  return {
    modules: normalizeModules((draft ?? pub)?.modules),
    source: draft ? "draft" : pub ? "published" : "default",
    publishedVersion: pub?.version ?? null,
  };
}

const toJson = (m: HomeModule[]) => m.map(({ key, enabled }) => ({ key, enabled }));

const ModulesInput = z.object({
  modules: z
    .array(z.object({ key: z.enum(HOME_MODULE_KEYS), enabled: z.boolean() }))
    .length(HOME_MODULE_KEYS.length)
    .refine((l) => new Set(l.map((m) => m.key)).size === l.length, "Módulos repetidos."),
});

export const saveHomeDraft = studioAction(
  "users.manage",
  () => ({}),
  async (input: { modules: HomeModule[] }, ctx) => {
    const del = await ctx.db.from("home_layouts").delete().eq("status", "draft");
    if (del.error) throw new Error(`home: ${del.error.message}`);
    const { error } = await ctx.db.from("home_layouts").insert({
      version: 0,
      status: "draft",
      modules: toJson(input.modules),
      created_by: ctx.userId,
    });
    if (error) throw new Error(`home: ${error.message}`);
    return { saved: true };
  },
  { schema: ModulesInput, objectRef: () => "home:rascunho", auditAs: "home.save_draft" },
);

export const publishHome = studioAction(
  "users.manage",
  () => ({}),
  async (input: { modules: HomeModule[] }, ctx) => {
    const { data, error } = await ctx.db.rpc("home_publish", { p_modules: toJson(input.modules) });
    if (error) {
      if (error.code === "42501") throw new StudioFailure("forbidden");
      throw new Error(`home: ${error.message}`);
    }
    ctx.setObjectRef(`home:v${data}`);
    ctx.detail({
      version: data,
      order: input.modules.map((m) => `${m.enabled ? "" : "-"}${m.key}`),
    });
    await ctx.revalidate(["home"]);
    return { version: data };
  },
  { schema: ModulesInput, objectRef: () => "home:publicar", auditAs: "home.publish" },
);
