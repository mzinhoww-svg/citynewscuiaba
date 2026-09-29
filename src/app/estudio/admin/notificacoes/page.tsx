import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components";
import { PUSH_ADMIN_TEXT as T } from "@/content/pt-BR/notifications-admin";
import { canAccess } from "@/lib/auth";
import { requireAnyRole } from "@/lib/auth/require-role";
import { PUSH_ACTIONS } from "@/lib/push/permissions";
import { PUSH_ADMIN_PATH } from "../../nav";

export const metadata: Metadata = { title: "Notificações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/**
 * Aba 1 · Novo envio (spec §10.2). Quem não pede envio vai para a fila (aprovadores) ou para o
 * Funil do app (analista). O formulário chega na PW-T12.
 */
export default async function PushNewPage() {
  const session = await requireAnyRole(PUSH_ACTIONS, { next: PUSH_ADMIN_PATH });
  const roles = session.roles;
  if (!canAccess(roles, "push.request")) {
    if (canAccess(roles, "push.approve") || canAccess(roles, "push.settings"))
      redirect(`${PUSH_ADMIN_PATH}/fila`);
    redirect(`${PUSH_ADMIN_PATH}/funil`);
  }
  return (
    <EmptyState title={T.tabs.new} icon="bell">
      {T.followNote}
    </EmptyState>
  );
}
