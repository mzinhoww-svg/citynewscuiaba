"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey } from "../flash";
import { grantRole, parseSections, revokeRole, setRoleSections } from "@/lib/admin/users";
import type { Role } from "@/lib/auth/permissions";

const BACK = "/estudio/admin/papeis";
const fail = (r: Parameters<typeof errorKey>[0]): never =>
  redirect(`${BACK}?erro=${encodeURIComponent(errorKey(r))}`);

export async function grantRoleAction(formData: FormData): Promise<void> {
  const r = await grantRole({
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? "") as Role,
    sections: parseSections(String(formData.get("sections") ?? "")),
    justification: String(formData.get("justification") ?? ""),
  });
  if (!r.ok) return fail(r);
  revalidatePath(BACK);
  revalidatePath("/estudio/control/aprovacoes");
  redirect(`${BACK}?ok=${r.value.outcome}`);
}

export async function revokeRoleAction(formData: FormData): Promise<void> {
  const r = await revokeRole({
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? "") as Role,
  });
  if (!r.ok) return fail(r);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=revogado`);
}

export async function saveSectionsAction(formData: FormData): Promise<void> {
  const r = await setRoleSections({
    userId: String(formData.get("userId") ?? ""),
    role: String(formData.get("role") ?? "") as Role,
    sections: parseSections(String(formData.get("sections") ?? "")),
  });
  if (!r.ok) return fail(r);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=secoes`);
}
