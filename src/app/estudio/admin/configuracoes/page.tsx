import type { Metadata } from "next";
import { SettingsForm } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { listSettings } from "@/lib/db/queries/admin-ops";
import { loadOrNull } from "../../load-error";
import { setSettingAction } from "../ops-actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Configurações · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A14 · Configurações gerais (grade no banco, auditoria com valor anterior e novo). */
export default async function SettingsPage() {
  const session = await requireRole("users.manage", undefined, {
    next: "/estudio/admin/configuracoes",
  });
  const data = await loadOrNull("admin settings", () => listSettings());
  const editable = (data?.value ?? [])
    .map((s) => s.key)
    .filter((k) =>
      k.startsWith("security.")
        ? canAccess(session.roles, "users.manage")
        : k.startsWith("sources.")
          ? canAccess(session.roles, "source.manage")
          : canAccess(session.roles, "site.manage"),
    );
  return (
    <AdminScreen
      title={T.settings.title}
      intro={T.settings.intro}
      retryHref="/estudio/admin/configuracoes"
      failed={data === null}
    >
      {data && <SettingsForm settings={data.value} editable={editable} save={setSettingAction} />}
    </AdminScreen>
  );
}
