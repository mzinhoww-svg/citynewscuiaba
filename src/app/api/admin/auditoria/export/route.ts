import { auditCsv } from "@/lib/admin/audit-csv";
import { isAdminRole } from "@/lib/admin/access";
import { auditFiltersFrom } from "@/lib/admin/audit-filters";
import { audit } from "@/lib/audit";
import { canAccess } from "@/lib/auth/permissions";
import { getSession } from "@/lib/auth/require-role";
import { listAuditForExport } from "@/lib/db/queries/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** Exporta a auditoria filtrada (até 5.000 registros). IP inteiro só para admin; a exportação é auditada. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session)
    return Response.json({ error: "unauthenticated" }, { status: 401, headers: NO_STORE });
  if (!canAccess(session.roles, "audit.view"))
    return Response.json({ error: "forbidden" }, { status: 403, headers: NO_STORE });

  const { filters } = auditFiltersFrom(Object.fromEntries(new URL(req.url).searchParams));
  try {
    const rows = await listAuditForExport(filters);
    await audit(session.userId, "audit.view", "audit_log:export", {
      rows: rows.length,
      filters,
    }).catch(() => undefined);
    return new Response(auditCsv(rows, isAdminRole(session.roles)), {
      headers: {
        ...NO_STORE,
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="citynews-auditoria.csv"',
      },
    });
  } catch (e) {
    console.error("admin auditoria export:", e instanceof Error ? e.message : e);
    return Response.json({ error: "unavailable" }, { status: 503, headers: NO_STORE });
  }
}
