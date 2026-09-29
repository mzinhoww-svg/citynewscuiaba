import type { Metadata } from "next";
import { SecurityPanel } from "@/components";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { requireRole } from "@/lib/auth/require-role";
import { securityOverview } from "@/lib/db/queries/admin-ops";
import { loadOrNull } from "../../load-error";
import {
  rotateKeyAction,
  savePrivacyRequestAction,
  saveSecuritySettingsAction,
} from "../ops-actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = {
  title: "Segurança e privacidade · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** A11 · Segurança e privacidade. */
export default async function SecurityPage() {
  await requireRole("users.manage", undefined, { next: "/estudio/admin/seguranca" });
  const data = await loadOrNull("admin security", () => securityOverview());
  return (
    <AdminScreen
      title={T.security.title}
      intro={T.security.intro}
      retryHref="/estudio/admin/seguranca"
      failed={data === null}
    >
      {data && (
        <SecurityPanel
          data={data.value}
          now={new Date().toISOString()}
          saveSettings={saveSecuritySettingsAction}
          savePrivacy={savePrivacyRequestAction}
          rotateKey={rotateKeyAction}
        />
      )}
    </AdminScreen>
  );
}
