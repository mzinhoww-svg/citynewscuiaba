"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { NEIGHBORHOODS } from "@/content/pt-BR/neighborhoods";
import type { DeleteState, ExportResult, ProfileState } from "@/lib/auth/form-state";
import { getReader } from "@/lib/auth/reader";
import { exportAccount } from "@/lib/db/account";

/** Perfil (P20): nome de exibição e bairro principal (da lista curada, ou nenhum). */
export async function updateProfileAction(
  _prev: ProfileState,
  form: FormData,
): Promise<ProfileState> {
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=%2Fperfil");
  const name = String(form.get("name") ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const hood = String(form.get("neighborhood") ?? "").trim();
  const current = String(form.get("current_neighborhood") ?? "").trim();
  if (!name || name.length > 80) return { status: "invalid" };
  const allowed = hood === "" || hood === current || NEIGHBORHOODS.some((n) => n.name === hood);
  if (!allowed) return { status: "invalid" };
  const { error } = await reader.db
    .from("profiles")
    .update({ display_name: name, neighborhood: hood || null })
    .eq("id", reader.user.id);
  if (error) return { status: "unavailable" };
  revalidatePath("/perfil");
  return { status: "saved" };
}

/**
 * Sair deste navegador, ou encerrar as outras sessões da conta mantendo esta (para quem entrou
 * num aparelho que não é seu).
 */
export async function signOutAction(form: FormData): Promise<void> {
  const reader = await getReader();
  const others = form.get("scope") === "others";
  if (reader) await reader.db.auth.signOut({ scope: others ? "others" : "local" });
  redirect(others ? "/perfil/seguranca?sessoes=encerradas" : "/perfil?saiu=1");
}

/** Exportar dados (LGPD): o que a conta guarda, em JSON, só para o próprio leitor. */
export async function exportAccountAction(): Promise<ExportResult> {
  const reader = await getReader();
  if (!reader) return { ok: false };
  try {
    const data = await exportAccount(reader.db, reader.user);
    return { ok: true, data: JSON.stringify(data, null, 2) };
  } catch {
    return { ok: false };
  }
}

/** Excluir conta: só digitando EXCLUIR; vale em 7 dias (purge_deleted_accounts, 0014). */
export async function requestDeletionAction(
  _prev: DeleteState,
  form: FormData,
): Promise<DeleteState> {
  if (String(form.get("confirm") ?? "").trim() !== "EXCLUIR") return { status: "invalid" };
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=%2Fperfil");
  const { error } = await reader.db
    .from("profiles")
    .update({ delete_requested_at: new Date().toISOString() })
    .eq("id", reader.user.id);
  if (error) return { status: "unavailable" };
  redirect("/perfil?exclusao=agendada");
}

export async function cancelDeletionAction(): Promise<void> {
  const reader = await getReader();
  if (!reader) redirect("/entrar?next=%2Fperfil");
  await reader.db.from("profiles").update({ delete_requested_at: null }).eq("id", reader.user.id);
  redirect("/perfil?exclusao=cancelada");
}
