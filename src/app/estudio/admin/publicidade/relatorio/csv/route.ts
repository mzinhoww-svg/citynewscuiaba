import { getSession } from "@/lib/auth/require-role";
import { exportAdReportCommand } from "@/lib/studio/ads";

export const dynamic = "force-dynamic";

/**
 * A07 · CSV do relatório de banners no período (`de`, `ate`). Passa pelo comando (papel
 * `site.manage`, auditado como `ads.report.export`). Sem sessão: 401; sem papel: 403.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Sem sessão", { status: 401 });
  const url = new URL(req.url);
  const r = await exportAdReportCommand({
    from: url.searchParams.get("de") ?? undefined,
    to: url.searchParams.get("ate") ?? undefined,
  });
  if (!r.ok)
    return new Response(r.message ?? r.error, { status: r.error === "forbidden" ? 403 : 400 });
  return new Response(r.value.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="banners-${r.value.from}-a-${r.value.to}.csv"`,
      "cache-control": "no-store",
    },
  });
}
