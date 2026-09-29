import type { Metadata } from "next";
import { Button, ContingencyPanel, EmptyState } from "@/components";
import { CONTINGENCY as T } from "@/content/pt-BR/contingency";
import { isAdminRole } from "@/lib/admin/access";
import { requireArea } from "@/lib/admin/guard";
import { pendingApprovals } from "@/lib/approvals";
import { listFlagStates } from "@/lib/flags";
import { setContingencyAction } from "./actions";

export const metadata: Metadata = { title: "Contingência · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/admin/contingencia";

export default async function ContingencyPage() {
  const session = await requireArea("contingencia", NEXT);

  let data: {
    flags: Awaited<ReturnType<typeof listFlagStates>>;
    approvals: number;
  } | null = null;
  try {
    const [flags, approvals] = await Promise.all([
      listFlagStates(),
      pendingApprovals("").catch(() => []),
    ]);
    data = { flags, approvals: approvals.filter((a) => a.kind === "rules.activate").length };
  } catch (e) {
    console.error("estudio contingência:", e instanceof Error ? e.message : e);
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={NEXT} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <ContingencyPanel
          flags={data.flags}
          isAdmin={isAdminRole(session.roles)}
          action={setContingencyAction}
          pendingApprovals={data.approvals}
        />
      )}
    </section>
  );
}
