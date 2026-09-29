import type { Metadata } from "next";
import { AuditPanel, Button, EmptyState } from "@/components";
import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import { isAdminRole } from "@/lib/admin/access";
import { auditFiltersFrom, auditQueryString } from "@/lib/admin/audit-filters";
import { requireArea } from "@/lib/admin/guard";
import { actorNames, listAudit } from "@/lib/db/queries/admin";

export const metadata: Metadata = { title: "Auditoria · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/auditoria";
type Params = Record<string, string | string[] | undefined>;

export default async function AuditPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireArea("auditoria", NEXT);
  const sp = await searchParams;
  const { filters, values, page } = auditFiltersFrom(sp);

  let data: {
    rows: Awaited<ReturnType<typeof listAudit>>["rows"];
    hasMore: boolean;
    names: Map<string, string>;
  } | null = null;
  try {
    const r = await listAudit(filters, page);
    data = { ...r, names: await actorNames(r.rows.map((x) => x.actor)) };
  } catch (e) {
    console.error("estudio auditoria:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.audit.title}</h1>
        <p className="type-body text-meta">{T.audit.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.common.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.common.retry}
            </Button>
          }
        >
          {T.common.errorBody}
        </EmptyState>
      ) : (
        <AuditPanel
          action={NEXT}
          values={values}
          rows={data.rows}
          names={data.names}
          page={page}
          hasMore={data.hasMore}
          isAdmin={isAdminRole(session.roles)}
          hrefFor={(p) => `${NEXT}${auditQueryString(values, p)}`}
          exportHref={`/api/admin/auditoria/export${auditQueryString(values, 1)}`}
        />
      )}
    </section>
  );
}
