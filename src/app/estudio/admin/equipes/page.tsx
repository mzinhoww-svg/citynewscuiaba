import type { Metadata } from "next";
import { TeamsEditor } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";
import { requireRole } from "@/lib/auth/require-role";
import { listStaff, listTeams, taxonomyOverview } from "@/lib/db/queries/admin";
import { loadOrNull } from "../../load-error";
import { deleteTeamAction, saveTeamAction } from "../actions";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Equipes · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** A04 · Equipes editoriais. */
export default async function TeamsPage() {
  await requireRole("users.manage", undefined, { next: "/estudio/admin/equipes" });
  const data = await loadOrNull("admin teams", async () => {
    const [teams, staff, tax] = await Promise.all([listTeams(), listStaff(), taxonomyOverview()]);
    return {
      teams,
      people: staff.map((p) => ({ id: p.id, name: p.name })),
      sections: tax.sections
        .filter((s) => !s.parentSlug)
        .map((s) => ({ slug: s.slug, name: s.name })),
    };
  });
  return (
    <AdminScreen
      title={T.teams.title}
      intro={T.teams.intro}
      retryHref="/estudio/admin/equipes"
      failed={data === null}
    >
      {data && <TeamsEditor {...data.value} save={saveTeamAction} remove={deleteTeamAction} />}
    </AdminScreen>
  );
}
