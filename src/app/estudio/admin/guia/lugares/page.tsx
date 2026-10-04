import type { Metadata } from "next";
import { VenuesPanel } from "@/components/estudio";
import { can } from "@/lib/auth/permissions";
import { createServerClient } from "@/lib/db/client";
import { adminOpenReports, adminStatus, adminVenues } from "@/lib/db/queries/guide-admin";
import { CATEGORIES } from "@/lib/guide/categories";
import { loadOrNull } from "../../../load-error";
import { guideSession } from "../access";
import { decideReportAction, saveVenueAction, takedownVenuePhotoAction } from "../actions";
import { GuideScreen } from "../GuideScreen";

export const metadata: Metadata = {
  title: "Lugares · Guia Cuiabá · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  slug: c.slug,
  label: c.singular.charAt(0).toUpperCase() + c.singular.slice(1),
}));

/** Guia · Lugares: cadastro, reclamações abertas e retirada de foto a pedido. */
export default async function GuideVenuesPage() {
  const session = await guideSession("/estudio/admin/guia/lugares");
  const data = await loadOrNull("guide venues", async () => {
    const db = await createServerClient();
    const [venues, reports, status] = await Promise.all([
      adminVenues(db),
      adminOpenReports(db),
      adminStatus(db),
    ]);
    return { venues, reports, status };
  });
  return (
    <GuideScreen active="lugares" status={data?.value.status ?? null} failed={data === null}>
      {data && (
        <VenuesPanel
          venues={data.value.venues}
          reports={data.value.reports}
          categories={CATEGORY_OPTIONS}
          save={saveVenueAction}
          takedown={takedownVenuePhotoAction}
          decide={decideReportAction}
          canTakedown={can(session.roles, "media.approve") || can(session.roles, "site.manage")}
        />
      )}
    </GuideScreen>
  );
}
