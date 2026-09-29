import type { Metadata } from "next";
import { Button, EmptyState, LogExplorer } from "@/components";
import { MONITOR_TEXT as T } from "@/content/pt-BR/control-monitor";
import { requireRole } from "@/lib/auth/require-role";
import { logFiltersFrom } from "@/lib/control/log-filters";
import type { EventRow } from "@/lib/control/types";
import { queryLogs } from "@/lib/db/queries/control";

export const metadata: Metadata = { title: "Logs · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/logs";
type Params = Record<string, string | string[] | undefined>;

export default async function LogsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await requireRole("metrics.view", undefined, { next: NEXT });
  const isAdmin = session.roles.some((r) => r.role === "admin");
  const sp = await searchParams;
  const { filters, order } = logFiltersFrom(sp);
  const pageRaw = Number(Array.isArray(sp.pagina) ? sp.pagina[0] : sp.pagina);
  const page = Number.isInteger(pageRaw) && pageRaw > 0 ? Math.min(pageRaw, 1000) : 1;

  let data: { rows: EventRow[]; hasMore: boolean } | null = null;
  try {
    data = await queryLogs(filters, page, undefined, order === "asc");
  } catch (e) {
    console.error("control logs:", e instanceof Error ? e.message : e);
  }

  const query = (over: { page?: number; order?: "asc" | "desc" }, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    const p: [string, string | undefined][] = [
      ["ciclo", filters.run],
      ["item", filters.item],
      ["fonte", filters.source],
      ["etapa", filters.step],
      ["nivel", filters.level],
      ["agente", filters.agent],
      ["q", filters.q],
    ];
    for (const [k, v] of p) if (v) q.set(k, v);
    const o = over.order ?? order;
    if (o === "asc") q.set("ordem", "asc");
    const pg = over.page ?? page;
    if (pg > 1) q.set("pagina", String(pg));
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    const s = q.toString();
    return s ? `?${s}` : "";
  };

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.logs.title}</h1>
        <p className="type-body text-meta">{T.logs.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.logs.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.logs.retry}
            </Button>
          }
        >
          {T.logs.errorBody}
        </EmptyState>
      ) : (
        <LogExplorer
          action={NEXT}
          values={{
            ciclo: filters.run,
            item: filters.item,
            fonte: filters.source,
            etapa: filters.step,
            nivel: filters.level,
            agente: filters.agent,
            q: filters.q,
          }}
          rows={data.rows}
          page={page}
          hasMore={data.hasMore}
          order={order}
          masked={!isAdmin}
          hrefFor={(over) => `${NEXT}${query(over)}`}
          exportHref={`/api/control/logs/export${query({ page: 1 })}`}
        />
      )}
    </section>
  );
}
