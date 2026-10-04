"use server";

/**
 * Server Actions da central de notificações da equipe (BELL-T1). Só POST (formulários e botões do
 * Estúdio). A leitura é sempre da própria pessoa; o banco recorta pelo papel.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { redirect } from "next/navigation";
import { loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import {
  markAllRead,
  markRead,
  setStaffAlerts,
  staffAlertsOn,
} from "@/lib/db/queries/studio-notifications";

const uuid = z.string().uuid();

/** Qualquer pessoa da equipe (papel em `user_roles`); sem sessão ou sem papel, volta ao login. */
async function staff() {
  const session = await getSession();
  if (!session || session.roles.length === 0)
    redirect(
      loginRedirect(
        "/estudio/notificacoes",
        session?.expired ? "sessao-expirada" : "sem-permissao",
      ),
    );
  return session;
}

export async function markReadAction(formData: FormData): Promise<void> {
  await staff();
  const id = uuid.safeParse(formData.get("id"));
  if (id.success) await markRead([id.data]);
  revalidatePath("/estudio/notificacoes");
}

export async function markAllReadAction(): Promise<void> {
  await staff();
  await markAllRead();
  revalidatePath("/estudio/notificacoes");
}

export interface StaffAlertsState {
  ok: boolean;
  on: boolean;
}

/**
 * Liga ou desliga o push de urgências da central nas inscrições da própria pessoa. A inscrição
 * em si (permissão do navegador) é criada antes, no cliente, pelo fluxo de push existente com a
 * sessão aberta (`push_subscriptions.user_id`). Sem inscrição, ligar não faz nada.
 */
export async function setStaffAlertsAction(on: boolean): Promise<StaffAlertsState> {
  const session = await staff();
  const r = await setStaffAlerts(session.userId, on === true);
  if (!r.ok) return { ok: false, on: await staffAlertsOn(session.userId) };
  return { ok: true, on: on === true && r.value > 0 };
}
