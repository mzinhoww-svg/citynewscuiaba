import type { Metadata } from "next";
import { Button, EmptyState, Panel } from "@/components";
import { ApprovalBanner, ContingencyPanel, type ContingencyCard } from "@/components/estudio";
import { CONTINGENCY_TEXT as T } from "@/content/pt-BR/contingency";
import { requireRole } from "@/lib/auth/require-role";
import { contingencyOverview, type FlagState } from "@/lib/db/queries/contingency";
import { formatDateTime } from "@/lib/format/date";
import { loadOrNull } from "../../load-error";
import { contingencyAction } from "./actions";

export const metadata: Metadata = { title: "Contingência · Governança · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const since = (f: FlagState | null) =>
  f?.updatedBy ? T.since(f.updatedByName ?? T.unknownWho, formatDateTime(f.updatedAt)) : undefined;

function cardsOf(o: Awaited<ReturnType<typeof contingencyOverview>>): ContingencyCard[] {
  const C = T.cards;
  const auto = o.flags.auto_publish?.enabled ?? false;
  const ro = o.flags.read_only?.enabled ?? false;
  const ai = o.flags.ai_enabled?.enabled ?? false;
  return [
    {
      id: "auto_publish",
      title: C.auto_publish.title,
      state: auto ? C.auto_publish.on : C.auto_publish.off,
      since: since(o.flags.auto_publish),
      body: auto ? C.auto_publish.pauseBody : C.auto_publish.resumeBody,
      runbook: C.auto_publish.runbook,
      action: auto ? "pause_auto_publish" : "resume_auto_publish",
      tone: auto ? "ok" : "warn",
    },
    {
      id: "read_only",
      title: C.read_only.title,
      state: ro ? C.read_only.on : C.read_only.off,
      since: since(o.flags.read_only),
      body: ro ? C.read_only.offBody : C.read_only.onBody,
      runbook: C.read_only.runbook,
      action: ro ? "read_only_off" : "read_only_on",
      tone: ro ? "warn" : "ok",
    },
    {
      id: "ai_enabled",
      title: C.ai_enabled.title,
      state: ai ? C.ai_enabled.on : C.ai_enabled.off,
      since: since(o.flags.ai_enabled),
      body: ai ? C.ai_enabled.offBody : C.ai_enabled.onBody,
      runbook: C.ai_enabled.runbook,
      action: ai ? "ai_off" : "ai_on",
      tone: ai ? "ok" : "warn",
    },
    {
      id: "rules",
      title: C.rules.title,
      state:
        o.rules.active === null
          ? T.cards.rules.state(0, null)
          : C.rules.state(o.rules.active, o.rules.previous),
      body: C.rules.body,
      runbook: C.rules.runbook,
      action: o.rules.previous === null ? undefined : "rollback_rules",
      tone: "ok",
    },
  ];
}

/** A15 · Contingência: botões de emergência com confirmação, runbook e registro. */
export default async function ContingencyPage() {
  const session = await requireRole("users.manage", undefined, {
    next: "/estudio/admin/contingencia",
  });
  const data = await loadOrNull("contingency", () => contingencyOverview());

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
            <Button href="/estudio/admin/contingencia" size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        <>
          <ApprovalBanner approvals={data.value.resumeRequests} currentUserId={session.userId} />
          <ContingencyPanel cards={cardsOf(data.value)} run={contingencyAction} />
          <Panel aria-labelledby="restore" className="flex flex-col gap-2">
            <h2 id="restore" className="type-section text-strong">
              {T.restore.title}
            </h2>
            <p className="type-body text-body">{T.restore.body}</p>
            <a href={T.restore.runbook} className="type-body font-medium text-link underline">
              {T.runbook}
            </a>
          </Panel>
        </>
      )}
    </section>
  );
}
