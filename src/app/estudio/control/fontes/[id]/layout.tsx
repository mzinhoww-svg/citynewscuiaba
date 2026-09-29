import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import {
  Button,
  EditorialScore,
  EmptyState,
  FrequencyLabel,
  InlineAlert,
  SourceSectionNav,
  SourceStatusBadge,
} from "@/components";
import {
  IMAGE_POLICY_LABEL,
  LAYER_LABEL,
  REPUBLISH_POLICY_LABEL,
  RELIABILITY_LABEL,
  SOURCE_STATUS_LABEL,
} from "@/content/pt-BR/sources-admin";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";
import { viewerStance } from "@/lib/approvals/kinds";
import { getSession } from "@/lib/auth/require-role";
import { pendingSourceApprovals, type SourceDetail } from "@/lib/db/queries/sources-admin";
import { formatDateTime } from "@/lib/format/date";
import { collectNowAction, decideApprovalAction, sourceStatusAction } from "../actions";
import { getDetail, isUuid, NEXT } from "./data";
import { PendingApprovals, type PendingApprovalItem } from "./PendingApprovals";
import { SourceActions } from "./SourceActions";

/** Valor atual do campo do pedido, em texto, para o "antes" do diff. */
function currentText(field: string, s: SourceDetail): string {
  switch (field) {
    case "image_policy":
      return IMAGE_POLICY_LABEL[s.config.imagePolicy];
    case "republish_policy":
      return REPUBLISH_POLICY_LABEL[s.config.republishPolicy];
    case "reliability":
      return RELIABILITY_LABEL[s.config.reliability];
    case "may_be_sole_source":
      return s.config.maySoleSource ? "Sim" : "Não";
    case "status":
      return SOURCE_STATUS_LABEL[s.status];
    default:
      return "—";
  }
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  if (!isUuid(id)) return { title: DETAIL.notFoundTitle };
  const res = await getDetail(id);
  return {
    title: DETAIL.title(res.ok && res.value ? res.value.config.name : DETAIL.notFoundTitle),
  };
}

export default async function SourceLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const res = await getDetail(id);
  if (!res.ok) {
    return (
      <EmptyState
        as="h1"
        tone="error"
        title={DETAIL.errorTitle}
        actions={
          <Button size="md" variant="outline" href={`${NEXT}/${id}`}>
            {DETAIL.retry}
          </Button>
        }
      >
        {DETAIL.errorBody}
      </EmptyState>
    );
  }
  const s = res.value;
  if (!s) notFound();

  const session = await getSession();
  const approvals = await pendingSourceApprovals();
  const items: PendingApprovalItem[] = approvals.ok
    ? approvals.value
        .filter((a) => a.sourceId === id)
        .map((a) => ({
          id: a.id,
          field: a.field,
          value: a.value,
          currentText: currentText(a.field, s),
          justification: a.justification,
          requesterName: a.requesterName,
          requestedAt: formatDateTime(a.createdAt),
          stance: session
            ? viewerStance(session, { kind: a.kind, requestedBy: a.requestedBy })
            : "observer",
        }))
    : [];

  const name = s.config.name;
  const autoPaused =
    s.status === "paused" && s.statusReason === "auto_failures"
      ? DETAIL.autoPaused(formatDateTime(s.statusChangedAt), s.consecutiveFailures)
      : null;

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Button variant="text" size="md" icon="arrow-left" href={NEXT}>
          {DETAIL.back}
        </Button>
        <div className="flex flex-col gap-2">
          <h1 className="type-screen-title text-strong">{name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <a
              href={s.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={DETAIL.openSite(name)}
              className="type-body text-link underline underline-offset-4"
            >
              {hostOf(s.baseUrl)}
            </a>
            <SourceStatusBadge status={s.status} reason={s.statusReason} archived={s.archived} />
            <EditorialScore score={s.config.editorialScore} />
            {s.config.layer !== null && (
              <span className="type-meta text-meta">{LAYER_LABEL[s.config.layer]}</span>
            )}
          </div>
          {autoPaused && <p className="type-meta text-strong">{autoPaused}</p>}
          {s.lastError && s.status !== "active" && (
            <p className="type-meta text-meta break-words">
              {DETAIL.lastError}: {s.lastError}
            </p>
          )}
          <FrequencyLabel
            chosen={s.frequency.chosen}
            effective={s.frequency.effective}
            raisedBy={s.frequency.raisedBy}
            nextAt={s.nextCollectionAt}
            showNext
          />
        </div>
        {s.archived && (
          <InlineAlert tone="info" role="none" title={DETAIL.archivedTitle}>
            {DETAIL.archivedBody}
          </InlineAlert>
        )}
        <SourceActions
          id={s.id}
          version={s.version}
          name={name}
          status={s.status}
          statusReason={s.statusReason}
          archived={s.archived}
          statusAction={sourceStatusAction}
          collectAction={collectNowAction}
        />
        <PendingApprovals items={items} decide={decideApprovalAction} />
      </header>
      <SourceSectionNav basePath={`${NEXT}/${id}`} />
      {children}
    </section>
  );
}
