import type { Metadata } from "next";
import { StaffTable } from "@/components/estudio";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { listStaff, taxonomyOverview } from "@/lib/db/queries/admin";
import { loadOrNull } from "../../load-error";
import { inviteUserAction, setRolesAction } from "../actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Usuários · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A02 · Usuários: equipe, convites e papéis. */
export default async function UsersPage() {
  const session = await requireRole("users.manage", undefined, { next: "/estudio/admin/usuarios" });
  const data = await loadOrNull("admin users", async () => {
    const [staff, tax] = await Promise.all([listStaff(), taxonomyOverview()]);
    return {
      staff,
      sections: tax.sections
        .filter((s) => !s.parentSlug)
        .map((s) => ({ slug: s.slug, name: s.name })),
    };
  });
  return (
    <AdminScreen
      title={T.users.title}
      intro={T.users.intro}
      retryHref="/estudio/admin/usuarios"
      failed={data === null}
    >
      {data && (
        <StaffTable
          staff={data.value.staff}
          sections={data.value.sections}
          currentUserId={session.userId}
          invite={inviteUserAction}
          setRoles={setRolesAction}
        />
      )}
    </AdminScreen>
  );
}
