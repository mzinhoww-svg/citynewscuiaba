import type { Metadata } from "next";
import { AdsTabsNav, CampaignsPanel } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { requireRole } from "@/lib/auth/require-role";
import { taxonomyOverview } from "@/lib/db/queries/admin";
import { listCampaigns } from "@/lib/db/queries/admin-ops";
import { loadOrNull } from "../../../load-error";
import { deleteCampaignAction, saveCampaignAction } from "../../ops-actions";
import { AdminScreen } from "../../screen";

export const metadata: Metadata = { title: "Patrocinados · Publicidade · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PATH = "/estudio/admin/publicidade/patrocinados";

/** A07 · Publicidade, aba Patrocinados: campanhas de conteúdo patrocinado (P5-T9). */
export default async function SponsoredPage() {
  await requireRole("site.manage", undefined, { next: PATH });
  const data = await loadOrNull("admin ads", async () => {
    const [campaigns, tax] = await Promise.all([listCampaigns(), taxonomyOverview()]);
    return {
      campaigns,
      sections: tax.sections
        .filter((s) => !s.parentSlug)
        .map((s) => ({ slug: s.slug, name: s.name })),
    };
  });
  return (
    <AdminScreen title={T.ads.title} intro={T.ads.intro} retryHref={PATH} failed={data === null}>
      <AdsTabsNav />
      {data && (
        <CampaignsPanel {...data.value} save={saveCampaignAction} remove={deleteCampaignAction} />
      )}
    </AdminScreen>
  );
}
