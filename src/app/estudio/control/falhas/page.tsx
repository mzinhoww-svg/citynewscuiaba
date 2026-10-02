import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { JobTable } from "@/components/estudio";
import { CONTROL_TEXT as T } from "@/content/pt-BR/control";
import { requireRole } from "@/lib/auth/require-role";
import { controlAbilities } from "@/lib/control";
import { listFailures } from "@/lib/db/queries/control";
import { loadOrNull } from "../../load-error";
import { discardQuarantineAction, retryQuarantineAction } from "../actions";

export const metadata: Metadata = { title: "Falhas · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

export default async function FailuresPage() {
  const session = await requireRole("source.manage", undefined, {
    next: "/estudio/control/falhas",
  });
  const can = controlAbilities(session.roles);
  const data = await loadOrNull("control failures", () => listFailures({ maskIp: !can.admin }));
  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.failures.title}</h1>
        <p className="type-body text-meta">{T.failures.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/falhas" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : data.value.length === 0 ? (
        <EmptyState
          icon="check"
          title={T.failures.empty}
          actions={
            <Button href="/estudio/control/logs" size="md" variant="outline">
              {T.nav.logs}
            </Button>
          }
        />
      ) : (
        <JobTable
          rows={data.value}
          {...(can.operate
            ? { actions: { retry: retryQuarantineAction, discard: discardQuarantineAction } }
            : {})}
        />
      )}
    </section>
  );
}
