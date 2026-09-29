"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey } from "../flash";
import { addTeamMember, deleteTeam, removeTeamMember, saveTeam } from "@/lib/admin/teams";

const BACK = "/estudio/admin/equipes";
const fail = (r: Parameters<typeof errorKey>[0]): never =>
  redirect(`${BACK}?erro=${encodeURIComponent(errorKey(r))}`);
const done = (key: string): never => {
  revalidatePath(BACK);
  return redirect(`${BACK}?ok=${key}`);
};
const str = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function saveTeamAction(formData: FormData): Promise<void> {
  const id = str(formData, "id");
  const r = await saveTeam({
    ...(id ? { id } : {}),
    name: str(formData, "name"),
    description: str(formData, "description"),
    leadId: str(formData, "leadId") || null,
  });
  if (!r.ok) return fail(r);
  return done(id ? "salva" : "criada");
}

export async function deleteTeamAction(formData: FormData): Promise<void> {
  const r = await deleteTeam({ id: str(formData, "id") });
  if (!r.ok) return fail(r);
  return done("excluida");
}

export async function addMemberAction(formData: FormData): Promise<void> {
  const r = await addTeamMember({
    teamId: str(formData, "teamId"),
    userId: str(formData, "userId"),
  });
  if (!r.ok) return fail(r);
  return done("adicionada");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const r = await removeTeamMember({
    teamId: str(formData, "teamId"),
    userId: str(formData, "userId"),
  });
  if (!r.ok) return fail(r);
  return done("removida");
}
