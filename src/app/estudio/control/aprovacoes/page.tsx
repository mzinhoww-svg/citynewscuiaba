import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ApprovalBanner, Button, EmptyState, InlineAlert } from "@/components";
import {
  APPROVAL_ERROR_TEXT,
  APPROVAL_KIND_LABEL,
  APPROVAL_STATUS_LABEL,
  APPROVALS_TEXT as T,
  approvalTargetLabel,
} from "@/content/pt-BR/approvals";
import { ROLE_LABEL } from "@/content/pt-BR/studio";
import {
  APPROVAL_KIND_ROLES,
  approvalEffect,
  canSeeApprovals,
  viewerStance,
} from "@/lib/approvals/kinds";
import { loginRedirect } from "@/lib/auth";
import { getSession } from "@/lib/auth/require-role";
import { listApprovals, type ApprovalRow } from "@/lib/db/queries/approvals";
import { formatDateTime } from "@/lib/format/date";
import { approveApprovalAction, rejectApprovalAction } from "./actions";

export const metadata: Metadata = { title: "Aprovações · Estúdio · CityNews Cuiabá" };
export const dynamic = "force-dynamic";

const NEXT = "/estudio/control/aprovacoes";
type Params = Record<string, string | string[] | undefined>;
const ERRORS = Object.keys(APPROVAL_ERROR_TEXT) as (keyof typeof APPROVAL_ERROR_TEXT)[];

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const session = await getSession();
  if (!session) redirect(loginRedirect(NEXT));
  if (!canSeeApprovals(session.roles)) redirect(loginRedirect(NEXT, "sem-permissao"));
  const sp = await searchParams;
  const error = ERRORS.find((e) => e === sp.erro);
  const done = sp.ok === "aprovada" ? T.approved : sp.ok === "recusada" ? T.rejected : null;

  let data: { pending: ApprovalRow[]; recent: ApprovalRow[] } | null = null;
  try {
    data = await listApprovals();
  } catch (e) {
    console.error("estudio aprovações:", e instanceof Error ? e.message : e);
    data = null;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{T.title}</h1>
        <p className="type-body text-meta">{T.intro}</p>
      </header>
      {done && (
        <InlineAlert tone="success" role="status">
          {done}
        </InlineAlert>
      )}
      {error && (
        <InlineAlert tone="error" role="alert">
          {APPROVAL_ERROR_TEXT[error]}
        </InlineAlert>
      )}
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
        <>
          <section aria-labelledby="aprovacoes-pendentes" className="flex flex-col gap-4">
            <h2 id="aprovacoes-pendentes" className="type-section text-strong">
              {T.pendingTitle}
            </h2>
            {data.pending.length === 0 ? (
              <EmptyState title={T.emptyTitle} icon="file-check" as="h3">
                {T.emptyBody}
              </EmptyState>
            ) : (
              <ul className="flex flex-col gap-4" aria-label={T.pendingCaption}>
                {data.pending.map((a) => {
                  const what = `${APPROVAL_KIND_LABEL[a.kind]}, ${approvalTargetLabel(a.kind, a.targetRef)}`;
                  return (
                    <li key={a.id}>
                      <ApprovalBanner
                        id={a.id}
                        kind={a.kind}
                        targetLabel={approvalTargetLabel(a.kind, a.targetRef)}
                        justification={a.justification}
                        requesterName={a.requesterName ?? T.unknownPerson}
                        requestedAt={formatDateTime(a.createdAt)}
                        effect={approvalEffect(a.kind)}
                        stance={viewerStance(session, { kind: a.kind, requestedBy: a.requestedBy })}
                        deciders={APPROVAL_KIND_ROLES[a.kind].decide
                          .map((r) => ROLE_LABEL[r])
                          .join(", ")}
                        actions={
                          <form action={approveApprovalAction} className="flex flex-wrap gap-3">
                            <input type="hidden" name="id" value={a.id} />
                            <Button
                              type="submit"
                              size="md"
                              icon="check"
                              aria-label={T.approveNamed(what)}
                            >
                              {T.approve}
                            </Button>
                            <Button
                              type="submit"
                              size="md"
                              variant="outline"
                              formAction={rejectApprovalAction}
                              aria-label={T.rejectNamed(what)}
                            >
                              {T.reject}
                            </Button>
                          </form>
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section aria-labelledby="aprovacoes-recentes" className="flex flex-col gap-4">
            <h2 id="aprovacoes-recentes" className="type-section text-strong">
              {T.recentTitle}
            </h2>
            {data.recent.length === 0 ? (
              <p className="type-body text-meta">{T.noRecent}</p>
            ) : (
              <div
                role="region"
                aria-label={T.recentCaption}
                tabIndex={0}
                className="relative overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
              >
                <table className="w-full min-w-[44rem] border-collapse text-left">
                  <caption className="sr-only">{T.recentCaption}</caption>
                  <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                    <tr>
                      <th scope="col" className="px-3 py-3">
                        {T.colKind}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colTarget}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colRequester}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colDecider}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colStatus}
                      </th>
                      <th scope="col" className="px-3 py-3">
                        {T.colWhen}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent.map((a) => (
                      <tr
                        key={a.id}
                        className="border-b border-line-subtle align-top last:border-b-0"
                      >
                        <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                          {APPROVAL_KIND_LABEL[a.kind]}
                        </th>
                        <td className="px-3 py-3 type-body">
                          {approvalTargetLabel(a.kind, a.targetRef)}
                        </td>
                        <td className="px-3 py-3 type-body">
                          {a.requesterName ?? T.unknownPerson}
                        </td>
                        <td className="px-3 py-3 type-body">{a.deciderName ?? T.unknownPerson}</td>
                        <td className="px-3 py-3 type-body">
                          {APPROVAL_STATUS_LABEL[a.status] ?? a.status}
                        </td>
                        <td className="px-3 py-3 type-body tabular-nums">
                          {formatDateTime(a.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </section>
  );
}
