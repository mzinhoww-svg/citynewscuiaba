import { parseAuditFilters } from "@/lib/admin/audit-export";
import { getSession } from "@/lib/auth/require-role";
import { exportAuditCommand } from "@/lib/studio/admin-ops";

export const dynamic = "force-dynamic";

/**
 * A10 · Exportação CSV da auditoria com os filtros da tela. Passa pelo comando (papel
 * `audit.view`, IP mascarado `a.b.x.x` e hash oculto para quem não é admin, auditado como
 * `audit.export`). Sem sessão ou sem papel: 403.
 */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return new Response("Sem sessão", { status: 401 });
  const url = new URL(req.url);
  const filters = parseAuditFilters(Object.fromEntries(url.searchParams.entries()));
  const r = await exportAuditCommand({ filters });
  if (!r.ok)
    return new Response(r.message ?? r.error, { status: r.error === "forbidden" ? 403 : 400 });
  const day = new Date().toISOString().slice(0, 10);
  return new Response(r.value.csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="auditoria-${day}.csv"`,
      "cache-control": "no-store",
      ...(r.value.truncated ? { "x-export-truncated": "1" } : {}),
    },
  });
}
