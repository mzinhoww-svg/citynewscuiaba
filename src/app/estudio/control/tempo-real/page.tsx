import type { Metadata } from "next";
import { Button, EmptyState, LiveMonitor } from "@/components";
import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { liveSnapshot } from "@/lib/db/queries/control";
import { loadOrNull } from "../../load-error";

export const metadata: Metadata = { title: "Tempo real · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

export default async function LivePage() {
  const session = await requireRole("metrics.view", undefined, {
    next: "/estudio/control/tempo-real",
  });
  const data = await loadOrNull("control live", () =>
    liveSnapshot({ maskIp: !controlAbilities(session.roles).admin }),
  );
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.live.title}</h1>
        <p className="type-body text-meta">{T.live.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/tempo-real" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <LiveMonitor initial={data.value} endpoint="/api/control/live" />
      )}
    </section>
  );
}
