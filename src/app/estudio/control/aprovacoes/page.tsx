import type { Metadata } from "next";
import { Button, EmptyState } from "@/components";
import { ApprovalInbox } from "@/components/estudio";
import { APPROVALS_TEXT as T } from "@/content/pt-BR/approvals";
import { CRITICAL_KINDS } from "@/lib/approvals/approvals";
import { APPROVER_ACTION } from "@/lib/approvals/targets";
import { canAccess } from "@/lib/auth";
import { requireRole } from "@/lib/auth/require-role";
import { approvalsInbox } from "@/lib/db/queries/approvals";
import { loadOrNull } from "../../load-error";
import { decideApprovalAction } from "./actions";

export const metadata: Metadata = { title: "Aprovações · Control Center · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

/** Caixa de aprovações (P5-T1): quem propõe ou decide mudança crítica. */
export default async function ApprovalsPage() {
  const session = await requireRole("rules.propose", undefined, {
    next: "/estudio/control/aprovacoes",
  });
  const data = await loadOrNull("approvals", () => approvalsInbox());
  const decidable = CRITICAL_KINDS.filter((k) => canAccess(session.roles, APPROVER_ACTION[k]));

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <p className="type-eyebrow">{T.sectionLabel}</p>
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {data === null ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href="/estudio/control/aprovacoes" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <ApprovalInbox
          pending={data.value.pending}
          recent={data.value.recent}
          currentUserId={session.userId}
          decidable={decidable}
          decide={decideApprovalAction}
        />
      )}
    </section>
  );
}
