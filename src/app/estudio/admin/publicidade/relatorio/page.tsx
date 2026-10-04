import type { Metadata } from "next";
import { AdReportPanel, AdsTabsNav } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { buildReport, reportPeriod } from "@/lib/ads/report";
import { requireRole } from "@/lib/auth/require-role";
import { adReportRows } from "@/lib/db/queries/ads-admin";
import { loadOrNull } from "../../../load-error";
import { AdminScreen } from "../../screen";

export const metadata: Metadata = { title: "Relatório · Publicidade · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PATH = "/estudio/admin/publicidade/relatorio";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** A07 · Publicidade, aba Relatório: impressões, visualizações, cliques e CSV (ADS-T4). */
export default async function AdReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireRole("site.manage", undefined, { next: PATH });
  const q = await searchParams;
  const period = reportPeriod({ from: one(q.de), to: one(q.ate) }, new Date());
  const data = await loadOrNull("admin ads report", async () =>
    buildReport(await adReportRows(period)),
  );
  const csvHref = `${PATH}/csv?de=${period.from}&ate=${period.to}`;
  return (
    <AdminScreen title={T.ads.title} intro={T.ads.intro} retryHref={PATH} failed={data === null}>
      <AdsTabsNav />
      {data && <AdReportPanel report={data.value} period={period} csvHref={csvHref} />}
    </AdminScreen>
  );
}
