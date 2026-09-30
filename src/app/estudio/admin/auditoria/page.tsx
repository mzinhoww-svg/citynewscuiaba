import type { Metadata } from "next";
import { AuditExplorer } from "@/components/estudio";
import { ADMIN_OPS_TEXT as T } from "@/content/pt-BR/admin-ops";
import { auditFiltersQuery, parseAuditFilters } from "@/lib/admin/audit-export";
import { requireRole } from "@/lib/auth/require-role";
import { searchAudit } from "@/lib/db/queries/admin-ops";
import { loadOrNull } from "../../load-error";
import { AdminScreen } from "../screen";

export const metadata: Metadata = { title: "Auditoria · Administração · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const PAGE = 50;
const BASE = "/estudio/admin/auditoria";

/** A10 · Auditoria: registro só de acréscimo, filtros, IP mascarado para quem não é admin, CSV. */
export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireRole("audit.view", undefined, { next: BASE });
  const params = await searchParams;
  const filters = parseAuditFilters(params);
  const beforeRaw = Array.isArray(params.antes) ? params.antes[0] : params.antes;
  const before = beforeRaw && /^\d+$/.test(beforeRaw) ? Number(beforeRaw) : undefined;
  const admin = session.roles.some((r) => r.role === "admin");
  const data = await loadOrNull("admin audit", () =>
    searchAudit(filters, { limit: PAGE + 1, maskIp: !admin, ...(before ? { before } : {}) }),
  );
  const query = auditFiltersQuery(filters);
  const rows = data ? data.value.slice(0, PAGE) : [];
  const last = rows[rows.length - 1];
  const more =
    data && data.value.length > PAGE && last
      ? `${BASE}${query}${query ? "&" : "?"}antes=${last.id}`
      : null;
  return (
    <AdminScreen
      title={T.audit.title}
      intro={T.audit.intro}
      retryHref={`${BASE}${query}`}
      failed={data === null}
    >
      {data && (
        <AuditExplorer
          action={BASE}
          filters={filters}
          rows={rows}
          moreHref={more}
          exportHref={`${BASE}/export${query}`}
          masked={!admin}
        />
      )}
    </AdminScreen>
  );
}
