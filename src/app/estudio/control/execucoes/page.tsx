import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { RunsTable } from "@/components/estudio";
import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { listRuns } from "@/lib/db/queries/control";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Execuções · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

export default async function RunsPage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/execucoes",
  });
  const can = controlAbilities(session.roles);
  const data = await loadOrNull("control runs", () => listRuns(30));
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.runs.title}</h1>
        <p className="type-body text-meta">{T.runs.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/execucoes" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : data.value.length === 0 ? (
        <EmptyState
          icon="history"
          title={T.runs.empty}
          actions={
            <Button href="/estudio/control" size="md" variant="outline">
              {T.nav.overview}
            </Button>
          }
        />
      ) : (
        <>
          <RunsTable
            rows={data.value.map((r) => ({
              id: r.id,
              startedAt: r.startedAt,
              manual: r.manual,
              state: r.state,
              durationMin: r.durationMin,
              ok: r.ok,
              failed: r.failed,
              pending: r.pending,
              costBrl: can.costs ? r.costBrl : null,
            }))}
          />
          {can.costs && <p className="type-meta text-meta">{T.runs.costNote}</p>}
        </>
      )}
    </section>
  );
}
