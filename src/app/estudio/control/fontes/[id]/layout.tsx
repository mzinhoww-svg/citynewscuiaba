import Link from "next/link";
import type { ReactNode } from "react";
import {
  Button,
  EditorialScore,
  EmptyState,
  Icon,
  PendingApprovalsPanel,
  SourceHeaderActions,
  SourceSectionNav,
  SourceStatusBadge,
} from "@/components";
import { fullDateTime, STATUS_REASON_TEXT } from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT as T } from "@/content/pt-BR/sources-admin-detail";
import { can } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import type { SourceDetail } from "@/lib/db/queries/sources-admin";
import { collectNowAction, decideApprovalAction, sourceStatusAction } from "../actions";
import { BASE, detailPath, loadSource } from "./detail";
import NotFound from "./not-found";

type Props = { children: ReactNode; params: Promise<{ id: string }> };

/** Status com motivo em texto (spec §8: "Pausada automaticamente em 27/09 14:30 após 3 falhas"). */
export function statusLine(d: SourceDetail): string {
  const when = d.statusChangedAt ? fullDateTime(d.statusChangedAt) : null;
  if (d.archivedAt) return T.status.archived(fullDateTime(d.archivedAt), d.archiveReason);
  if (d.status === "active") return T.status.active;
  if (d.status === "degraded") return T.status.degraded(d.consecutiveFailures);
  if (d.status === "blocked")
    return T.status.blocked(
      d.statusReason ? STATUS_REASON_TEXT[d.statusReason] : STATUS_REASON_TEXT.other,
    );
  if (d.statusReason === "pending_activation") return T.status.pendingActivation;
  if (d.statusReason === "auto_failures")
    return when ? T.status.auto(when) : STATUS_REASON_TEXT.auto_failures;
  if (d.statusReason === "robots") return T.status.robots;
  return when ? T.status.manual(when, d.statusChangedBy?.name ?? null) : T.status.manualNoDate;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/**
 * O04 · Fonte (detalhe): cabeçalho (nome, domínio, status com motivo, score, ações), aviso de
 * arquivada, pedidos de aprovação pendentes e as seções como subrotas. Cada seção tem a própria
 * fronteira de erro (`error.tsx`), então uma falha numa aba não derruba o cabeçalho nem as outras.
 */
export default async function SourceDetailLayout({ children, params }: Props) {
  const { id } = await params;
  const [result, session] = await Promise.all([loadSource(id), getSession()]);
  if (!result.ok) {
    return (
      <EmptyState
        tone="error"
        as="h1"
        title={T.error.title}
        actions={<Button href={detailPath(id)}>{T.error.retry}</Button>}
      />
    );
  }
  const d = result.value;
  // `notFound()` num layout cai no not-found da raiz (fora do Estúdio): o 404 amigável é renderizado
  // aqui mesmo; as páginas das seções continuam usando `notFound()` (pego por ./not-found.tsx).
  if (!d) return <NotFound />;
  const name = d.config.displayName ?? d.config.name;
  const domain = domainOf(d.config.baseUrl);
  const currentValues: Record<string, string> = {
    image_policy: d.config.imagePolicy,
    republish_policy: d.config.republishPolicy,
    reliability: d.config.reliability,
    may_be_sole_source: String(d.config.maySoleSource),
    status: d.status,
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link
          href={BASE}
          className="inline-flex items-center gap-1 type-meta text-link no-underline hover:underline"
        >
          <Icon name="arrow-left" size={16} />
          {T.back}
        </Link>
        <div className="flex flex-col gap-2">
          <h1 className="type-screen-title text-strong">{name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 type-body text-meta">
            <a
              href={d.config.baseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-link underline-offset-4 hover:underline"
            >
              {domain}
              <Icon name="external-link" size={14} />
              <span className="sr-only"> {T.openSite(domain)}</span>
            </a>
            <EditorialScore score={d.config.editorialScore} />
          </p>
          <p className="flex flex-wrap items-center gap-2 type-body text-strong">
            <SourceStatusBadge status={d.displayStatus} />
            <span>{statusLine(d)}</span>
          </p>
        </div>
        {d.archivedAt && (
          <p className="flex items-start gap-2 rounded-lg border border-line-section bg-section px-4 py-3 type-body text-strong">
            <Icon name="archive" size={18} className="mt-0.5 shrink-0 text-meta" />
            {T.archivedNotice}
          </p>
        )}
        <SourceHeaderActions
          source={{
            id: d.id,
            version: d.version,
            name: d.config.name,
            status: d.status,
            statusReason: d.statusReason,
            archived: d.archivedAt !== null,
          }}
          statusAction={sourceStatusAction}
          collectNowAction={collectNowAction}
        />
        <PendingApprovalsPanel
          approvals={d.pendingApprovals}
          currentValues={currentValues}
          currentUserId={session?.userId ?? ""}
          canApprove={session ? can(session.roles, "source.approve_critical") : false}
          action={decideApprovalAction}
        />
      </header>
      <SourceSectionNav basePath={detailPath(d.id)} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
