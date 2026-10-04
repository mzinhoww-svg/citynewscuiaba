import type { Metadata } from "next";
import { AdOccupancyPanel, AdsTabsNav } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { slotOccupancy } from "@/lib/ads/report";
import { requireRole } from "@/lib/auth/require-role";
import { adsEnabled, listBanners, occupancyInput } from "@/lib/db/queries/ads-admin";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Publicidade · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PATH = "/estudio/admin/publicidade";

/** A07 · Publicidade, aba Campos: ocupação dos campos de banner (ADS-T4). */
export default async function AdsPage() {
  await requireRole("site.manage", undefined, { next: PATH });
  const data = await loadOrNull("admin ads occupancy", async () => {
    const [banners, enabled] = await Promise.all([listBanners(), adsEnabled()]);
    return { occupancy: slotOccupancy(occupancyInput(banners), new Date()), enabled };
  });
  return (
    <AdminScreen title={T.ads.title} intro={T.ads.intro} retryHref={PATH} failed={data === null}>
      <AdsTabsNav />
      {data && <AdOccupancyPanel {...data.value} />}
    </AdminScreen>
  );
}
