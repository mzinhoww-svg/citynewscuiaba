import type { Metadata } from "next";
import { ProposalsPanel } from "@/components/estudio";
import { CATEGORIES } from "@/lib/guide/categories";
import { createServerClient } from "@/lib/db/client";
import { adminProposals, adminStatus, adminVenues } from "@/lib/db/queries/guide-admin";
import { loadOrNull } from "../../../load-error";
import { guideSession } from "../access";
import {
  adjustListAction,
  discardListAction,
  proposeFromLinkAction,
  proposeManualAction,
  publishListAction,
} from "../actions";
import { GuideScreen } from "../GuideScreen";

export const metadata: Metadata = {
  title: "Propostas · Guia Cuiabá · Administração · CityNews Cuiabá",
};
export const dynamic = "force-dynamic";

const CATEGORY_OPTIONS = CATEGORIES.map((c) => ({
  slug: c.slug,
  label: c.singular.charAt(0).toUpperCase() + c.singular.slice(1),
}));

/** Guia · Propostas: o que o motor e os editores propuseram e ainda não foi decidido. */
export default async function GuideProposalsPage() {
  await guideSession("/estudio/admin/guia/propostas");
  const data = await loadOrNull("guide proposals", async () => {
    const db = await createServerClient();
    const [proposals, venues, status] = await Promise.all([
      adminProposals(db),
      adminVenues(db),
      adminStatus(db),
    ]);
    return { proposals, venues, status };
  });
  return (
    <GuideScreen active="propostas" status={data?.value.status ?? null} failed={data === null}>
      {data && (
        <ProposalsPanel
          proposals={data.value.proposals}
          categories={CATEGORY_OPTIONS}
          venues={data.value.venues
            .filter((v) => v.status === "active")
            .map((v) => ({
              id: v.id,
              name: v.name,
              category: v.category,
              neighborhood: v.neighborhood,
            }))}
          byLink={proposeFromLinkAction}
          manual={proposeManualAction}
          publish={publishListAction}
          discard={discardListAction}
          adjust={adjustListAction}
        />
      )}
    </GuideScreen>
  );
}
