import type { Metadata } from "next";
import { ListsPanel } from "@/components/estudio";
import { can } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/db/client";
import { adminLists, adminStatus, adminVenues } from "@/lib/db/queries/guide-admin";
import { loadOrNull } from "../../../load-error";
import { guideSession } from "../access";
import {
  adjustListAction,
  restoreListAction,
  setSponsorAction,
  suspendListAction,
} from "../actions";
import { GuideScreen } from "../GuideScreen";

export const metadata: Metadata = {
  title: "Listas · Guia Cuiabá · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

/** Guia · Listas: publicadas e suspensas, com atualização de 90 dias, patrocínio e a amostra de revisão. */
export default async function GuideListsPage() {
  const session = await guideSession("/estudio/admin/guia/listas");
  const data = await loadOrNull("guide lists", async () => {
    const db = await createServerClient();
    const [lists, venues, status] = await Promise.all([
      adminLists(db, ["published", "suspended", "draft"]),
      adminVenues(db),
      adminStatus(db),
    ]);
    return { lists, venues, status };
  });
  return (
    <GuideScreen active="listas" status={data?.value.status ?? null} failed={data === null}>
      {data && (
        <ListsPanel
          lists={data.value.lists}
          venues={data.value.venues
            .filter((v) => v.status === "active")
            .map((v) => ({
              id: v.id,
              name: v.name,
              category: v.category,
              neighborhood: v.neighborhood,
            }))}
          canSponsor={can(session.roles, "site.manage")}
          adjust={adjustListAction}
          suspend={suspendListAction}
          restore={restoreListAction}
          sponsor={setSponsorAction}
        />
      )}
    </GuideScreen>
  );
}
