import type { Metadata } from "next";
import { AdsTabsNav, BannersPanel } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { requireRole } from "@/lib/auth/require-role";
import { taxonomyOverview } from "@/lib/db/queries/admin";
import { listBanners } from "@/lib/db/queries/ads-admin";
import { loadOrNull } from "../../../load-error";
import { AdminScreen } from "../../screen";
import { createBannerAction, setPlacementStatusAction } from "../actions";

export const metadata: Metadata = { title: "Banners · Publicidade · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PATH = "/estudio/admin/publicidade/banners";

/** A07 · Publicidade, aba Banners: peças, situação e cadastro com envio de imagem (ADS-T4). */
export default async function BannersPage() {
  await requireRole("site.manage", undefined, { next: PATH });
  const data = await loadOrNull("admin banners", async () => {
    const [banners, tax] = await Promise.all([listBanners(), taxonomyOverview()]);
    return {
      banners,
      sections: tax.sections
        .filter((s) => !s.parentSlug)
        .map((s) => ({ slug: s.slug, name: s.name })),
    };
  });
  return (
    <AdminScreen title={T.ads.title} intro={T.ads.intro} retryHref={PATH} failed={data === null}>
      <AdsTabsNav />
      {data && (
        <BannersPanel
          {...data.value}
          create={createBannerAction}
          setStatus={setPlacementStatusAction}
        />
      )}
    </AdminScreen>
  );
}
