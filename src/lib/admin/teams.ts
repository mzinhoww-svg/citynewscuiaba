import "server-only";
import { z } from "zod";
import { TEAMS_TEXT as T } from "@/content/pt-BR/admin";
import { studioAction, StudioFailure } from "@/lib/studio/action";
import { studioContext } from "@/lib/studio/context";

/** Equipes (A04): nome, descrição, responsável e integrantes. Só `users.manage` (admin). */
export interface TeamRow {
  id: string;
  name: string;
  description: string | null;
  leadId: string | null;
  members: { id: string; name: string }[];
}

export async function listTeams(): Promise<{
  teams: TeamRow[];
  people: { id: string; name: string }[];
}> {
  const { db } = await studioContext();
  const [teams, members, people] = await Promise.all([
    db.from("teams").select("id, name, description, lead_id").order("name"),
    db.from("team_members").select("team_id, user_id"),
    db.rpc("studio_people"),
  ]);
  if (teams.error) throw new Error(`equipes: ${teams.error.message}`);
  if (members.error) throw new Error(`equipes: ${members.error.message}`);
  if (people.error) throw new Error(`equipes: ${people.error.message}`);
  const nameOf = new Map((people.data ?? []).map((p) => [p.id, p.name]));
  return {
    people: (people.data ?? []).map((p) => ({ id: p.id, name: p.name })),
    teams: (teams.data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      leadId: t.lead_id,
      members: (members.data ?? [])
        .filter((m) => m.team_id === t.id)
        .map((m) => ({ id: m.user_id, name: nameOf.get(m.user_id) ?? "Pessoa removida" }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    })),
  };
}

const Name = z.string().trim().min(2, T.errors.name).max(80, T.errors.name);
const Desc = z.string().trim().max(300).optional();

export const saveTeam = studioAction(
  "users.manage",
  () => ({}),
  async (
    input: { id?: string; name: string; description?: string; leadId?: string | null },
    ctx,
  ) => {
    const row = {
      name: input.name,
      description: input.description || null,
      lead_id: input.leadId || null,
    };
    const q = input.id
      ? ctx.db.from("teams").update(row).eq("id", input.id).select("id")
      : ctx.db.from("teams").insert(row).select("id");
    const { data, error } = await q;
    if (error) {
      if (error.code === "23505") throw new StudioFailure("invalid", T.errors.duplicate);
      throw new Error(`equipes: ${error.message}`);
    }
    const id = data?.[0]?.id;
    if (!id) throw new StudioFailure("not_found");
    ctx.setObjectRef(`team:${id}`);
    ctx.detail({ name: input.name, created: !input.id });
    return { id };
  },
  {
    schema: z.object({
      id: z.string().uuid().optional(),
      name: Name,
      description: Desc,
      leadId: z.string().uuid().nullable().optional(),
    }),
    objectRef: (i) => `team:${i.id ?? "nova"}`,
    auditAs: "team.save",
  },
);

export const deleteTeam = studioAction(
  "users.manage",
  () => ({}),
  async (input: { id: string }, ctx) => {
    const { data, error } = await ctx.db.from("teams").delete().eq("id", input.id).select("id");
    if (error) throw new Error(`equipes: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    return { id: input.id };
  },
  {
    schema: z.object({ id: z.string().uuid() }),
    objectRef: (i) => `team:${i.id}`,
    auditAs: "team.delete",
  },
);

export const addTeamMember = studioAction(
  "users.manage",
  () => ({}),
  async (input: { teamId: string; userId: string }, ctx) => {
    const { error } = await ctx.db
      .from("team_members")
      .upsert({ team_id: input.teamId, user_id: input.userId }, { onConflict: "team_id,user_id" });
    if (error) {
      if (error.code === "23503") throw new StudioFailure("not_found");
      throw new Error(`equipes: ${error.message}`);
    }
    ctx.detail({ userId: input.userId });
    return input;
  },
  {
    schema: z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }),
    objectRef: (i) => `team:${i.teamId}`,
    auditAs: "team.member_add",
  },
);

export const removeTeamMember = studioAction(
  "users.manage",
  () => ({}),
  async (input: { teamId: string; userId: string }, ctx) => {
    const { data, error } = await ctx.db
      .from("team_members")
      .delete()
      .eq("team_id", input.teamId)
      .eq("user_id", input.userId)
      .select("user_id");
    if (error) throw new Error(`equipes: ${error.message}`);
    if ((data ?? []).length === 0) throw new StudioFailure("not_found");
    ctx.detail({ userId: input.userId });
    return input;
  },
  {
    schema: z.object({ teamId: z.string().uuid(), userId: z.string().uuid() }),
    objectRef: (i) => `team:${i.teamId}`,
    auditAs: "team.member_remove",
  },
);
