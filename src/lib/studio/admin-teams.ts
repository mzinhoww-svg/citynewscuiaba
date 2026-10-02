import "server-only";
import { z } from "zod";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { slugify } from "@/lib/admin/taxonomy";
import { StudioFailure, studioAction } from "./action";

/* Equipes (A04, P5-T8): criar, editar e apagar, só admin (`users.manage`), com auditoria. */

const SaveTeamInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(300).optional(),
  sections: z
    .array(z.string().regex(/^[a-z0-9-]+$/))
    .max(20)
    .optional(),
  leadId: z.string().uuid().nullable().optional(),
  memberIds: z.array(z.string().uuid()).max(100).optional(),
});
export type SaveTeamInput = z.input<typeof SaveTeamInput>;

export const saveTeamCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i, ctx) => {
    const row = {
      name: i.name,
      slug: slugify(i.name),
      description: i.description ?? "",
      sections: i.sections ?? [],
      lead_id: i.leadId ?? null,
      updated_at: new Date().toISOString(),
    };
    const saved = i.id
      ? await ctx.db.from("teams").update(row).eq("id", i.id).select("id").maybeSingle()
      : await ctx.db.from("teams").insert(row).select("id").single();
    if (saved.error) {
      if (saved.error.code === "23505")
        throw new StudioFailure("conflict", T.teams.dialog.nameTaken);
      throw new Error(`team: ${saved.error.message}`);
    }
    if (!saved.data) throw new StudioFailure("not_found");
    const id = saved.data.id;
    const members = [...new Set([...(i.memberIds ?? []), ...(i.leadId ? [i.leadId] : [])])];
    const del = await ctx.db.from("team_members").delete().eq("team_id", id);
    if (del.error) throw new Error(`team members: ${del.error.message}`);
    if (members.length > 0) {
      const ins = await ctx.db
        .from("team_members")
        .insert(members.map((user_id) => ({ team_id: id, user_id })));
      if (ins.error) throw new Error(`team members: ${ins.error.message}`);
    }
    ctx.setObjectRef(`team:${id}`);
    ctx.detail({ name: i.name, sections: i.sections ?? [], leadId: i.leadId ?? null, members });
    return { id };
  },
  { schema: SaveTeamInput, auditAs: "team.save" },
);

export const deleteTeamCommand = studioAction(
  "users.manage",
  () => ({}),
  async (i: { id: string }, ctx) => {
    const { data, error } = await ctx.db.from("teams").delete().eq("id", i.id).select("name");
    if (error) throw new Error(`team delete: ${error.message}`);
    if (!data?.length) throw new StudioFailure("not_found");
    ctx.detail({ name: data[0]!.name });
    return { name: data[0]!.name };
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    auditAs: "team.delete",
    objectRef: (i) => `team:${i.id}`,
  },
);
