import type { Metadata } from "next";
import { Button, EmptyState, LiveMonitor } from "@/components";
import { MONITOR_TEXT as T } from "@/content/pt-BR/control-monitor";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import type { LiveSnapshot } from "@/lib/control/types";
import { liveSnapshot } from "@/lib/db/queries/control";

export const metadata: Metadata = { title: "Tempo real · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/tempo-real";

export default async function LivePage() {
  const session = await requireRole("metrics.view", undefined, { next: NEXT });
  let snap: LiveSnapshot | null = null;
  try {
    snap = await liveSnapshot();
  } catch (e) {
    console.error("control tempo real:", e instanceof Error ? e.message : e);
  }
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.live.title}</h1>
      </header>
      {snap === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.live.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.overview.retry}
            </Button>
          }
        >
          {T.overview.errorBody}
        </EmptyState>
      ) : (
        <LiveMonitor initial={snap} canRun={canAccess(session.roles, "source.manage")} />
      )}
    </section>
  );
}
