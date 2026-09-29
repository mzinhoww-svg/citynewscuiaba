import type { Metadata } from "next";
import {
  Button,
  CycleStrip,
  EmptyState,
  MonitorKpis,
  RunNowButton,
  SourceHealthTable,
} from "@/components";
import { MONITOR_TEXT as T } from "@/content/pt-BR/control-monitor";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { stepCounts } from "@/lib/control/monitor";
import type { LiveSnapshot } from "@/lib/control/types";
import { liveSnapshot } from "@/lib/db/queries/control";

export const metadata: Metadata = { title: "Visão geral · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control";

export default async function ControlOverviewPage() {
  const session = await requireRole("metrics.view", undefined, { next: NEXT });
  const canRun = canAccess(session.roles, "source.manage");

  let snap: LiveSnapshot | null = null;
  try {
    snap = await liveSnapshot();
  } catch (e) {
    console.error("control visão geral:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.overview.title}</h1>
        <p className="type-body text-meta">{T.overview.intro}</p>
      </header>
      {snap === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.overview.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.overview.retry}
            </Button>
          }
        >
          {T.overview.errorBody}
        </EmptyState>
      ) : (
        <Overview snap={snap} canRun={canRun} />
      )}
    </section>
  );
}

function Overview({ snap, canRun }: { snap: LiveSnapshot; canRun: boolean }) {
  const pendingByStep: Record<string, number> = {};
  for (const q of snap.queues) pendingByStep[q.step] = (pendingByStep[q.step] ?? 0) + q.total;
  const attention = snap.sources.filter((s) => s.state !== "ok");
  return (
    <>
      {canRun && <RunNowButton />}
      {snap.lastRun === null ? (
        <EmptyState title={T.overview.noRun} icon="clock">
          {T.overview.noRunBody}
        </EmptyState>
      ) : (
        <>
          <MonitorKpis snap={snap} />
          <CycleStrip steps={stepCounts(snap.steps, pendingByStep)} />
        </>
      )}
      <section aria-labelledby="ov-sources" className="flex flex-col gap-3">
        <h2 id="ov-sources" className="type-section text-strong">
          {T.overview.sourcesTitle}
        </h2>
        {attention.length === 0 ? (
          <p className="type-body text-meta">{T.overview.sourcesAllOk}</p>
        ) : (
          <SourceHealthTable rows={attention.slice(0, 10)} at={snap.at} />
        )}
      </section>
      <nav aria-label="Atalhos do monitoramento" className="flex flex-wrap gap-3">
        <Button href="/estudio/control/tempo-real" size="md" variant="outline" icon="gauge">
          {T.overview.liveLink}
        </Button>
        <Button href="/estudio/control/falhas" size="md" variant="outline" icon="triangle-alert">
          {T.overview.failuresLink}
        </Button>
        <Button href="/estudio/control/execucoes" size="md" variant="outline" icon="clock">
          {T.overview.runsLink}
        </Button>
        <Button href="/estudio/control/logs" size="md" variant="outline" icon="search">
          {T.overview.logsLink}
        </Button>
      </nav>
    </>
  );
}
