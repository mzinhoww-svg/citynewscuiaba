"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { errorKey } from "../flash";
import { parseSections, inviteUser, revokeInvite } from "@/lib/admin/users";
import type { Role } from "@/lib/auth/permissions";

const BACK = "/estudio/admin/usuarios";

export async function inviteUserAction(formData: FormData): Promise<void> {
  const r = await inviteUser({
    email: String(formData.get("email") ?? ""),
    role: String(formData.get("role") ?? "") as Role,
    sections: parseSections(String(formData.get("sections") ?? "")),
  });
  if (!r.ok) redirect(`${BACK}?erro=${encodeURIComponent(errorKey(r))}`);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=convite`);
}

export async function revokeInviteAction(formData: FormData): Promise<void> {
  const r = await revokeInvite({ id: String(formData.get("id") ?? "") });
  if (!r.ok) redirect(`${BACK}?erro=${encodeURIComponent(errorKey(r))}`);
  revalidatePath(BACK);
  redirect(`${BACK}?ok=cancelado`);
}
