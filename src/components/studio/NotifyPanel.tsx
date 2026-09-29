import { ADMIN_OPS as T } from "@/content/pt-BR/admin-ops";
import type { PushApprovalRow, PushDispatchRow, UrgentCandidate } from "@/lib/db/queries/admin";
import { formatDateTime } from "@/lib/format/date";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Select } from "../ui/Select";
import { AdminBlock, AdminField } from "./AdminFields";
import { AiOpsTable, CELL, ROW } from "./AiOpsTable";

type FormAction = (formData: FormData) => void | Promise<void>;

export interface NotifyPanelProps {
  candidates: readonly UrgentCandidate[];
  approvals: readonly PushApprovalRow[];
  history: readonly PushDispatchRow[];
  titles: ReadonlyMap<string, string>;
  names: ReadonlyMap<string, string>;
  queuedEmails: number;
  requestAction: FormAction;
  sendAction: FormAction;
}

function statusOf(a: PushApprovalRow): string {
  if (a.used) return T.notify.st.used;
  if (a.status === "approved") return T.notify.st.approved;
  if (a.status === "rejected") return T.notify.st.rejected;
  return T.notify.st.pending;
}

/** Notificações (A09): push urgente com aprovação de outra pessoa, histórico e e-mail do plantão. */
export function NotifyPanel({
  candidates,
  approvals,
  history,
  titles,
  names,
  queuedEmails,
  requestAction,
  sendAction,
}: NotifyPanelProps) {
  return (
    <div className="flex flex-col gap-10">
      <AdminBlock id="nt-urgent" title={T.notify.urgentTitle}>
        <p className="type-body">{T.notify.urgentBody}</p>
        {candidates.length === 0 ? (
          <p className="type-meta text-meta">{T.notify.noCandidates}</p>
        ) : (
          <form action={requestAction} className="flex max-w-xl flex-col gap-4">
            <Select
              id="nt-article"
              name="articleId"
              label={T.notify.article}
              required
              options={candidates.map((c) => ({ value: c.id, label: c.title }))}
            />
            <AdminField
              id="nt-why"
              name="justification"
              label={T.notify.justification}
              hint={T.notify.justificationHint}
              required
              multiline
              maxLength={500}
            />
            <div>
              <Button type="submit" variant="primary" size="md">
                {T.notify.request}
              </Button>
            </div>
          </form>
        )}
        {approvals.length === 0 ? (
          <EmptyState title={T.notify.approvalsEmpty} icon="bell" as="h3">
            {T.notify.approvalsEmptyBody}
          </EmptyState>
        ) : (
          <AiOpsTable
            caption={T.notify.approvalsCaption}
            minWidthClass="min-w-[44rem]"
            columns={[
              T.notify.colArticle,
              T.notify.colStatus,
              T.notify.colRequested,
              T.notify.colActions,
            ]}
          >
            {approvals.map((a) => {
              const title = titles.get(a.articleId) ?? a.articleId;
              const canSend = a.status === "approved" && !a.used;
              return (
                <tr key={a.id} className={ROW}>
                  <th scope="row" className={`${CELL} font-semibold text-strong`}>
                    {title}
                    <span className="block type-meta font-normal text-meta">
                      {names.get(a.requestedBy) ?? a.requestedBy}
                    </span>
                  </th>
                  <td className={CELL}>{statusOf(a)}</td>
                  <td className={`${CELL} tabular-nums`}>{formatDateTime(a.createdAt)}</td>
                  <td className={CELL}>
                    {canSend ? (
                      <form action={sendAction}>
                        <input type="hidden" name="articleId" value={a.articleId} />
                        <Button
                          type="submit"
                          variant="primary"
                          size="sm"
                          aria-label={T.notify.send(title)}
                        >
                          {T.notify.sendShort}
                        </Button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </AiOpsTable>
        )}
      </AdminBlock>

      <AdminBlock id="nt-history" title={T.notify.historyTitle}>
        {history.length === 0 ? (
          <EmptyState title={T.notify.historyEmpty} icon="bell" as="h3">
            {T.notify.historyEmptyBody}
          </EmptyState>
        ) : (
          <AiOpsTable
            caption={T.notify.historyCaption}
            minWidthClass="min-w-[40rem]"
            columns={[T.notify.colArticle, T.notify.colStatus, T.notify.colBy, T.notify.colWhen]}
          >
            {history.map((h) => (
              <tr key={h.id} className={ROW}>
                <th scope="row" className={`${CELL} font-semibold text-strong`}>
                  {h.title || h.articleId}
                </th>
                <td className={CELL}>
                  {(T.notify.dispatch as Record<string, string>)[h.status] ?? h.status}
                </td>
                <td className={CELL}>{names.get(h.sentBy) ?? h.sentBy}</td>
                <td className={`${CELL} tabular-nums`}>{formatDateTime(h.createdAt)}</td>
              </tr>
            ))}
          </AiOpsTable>
        )}
      </AdminBlock>

      <AdminBlock id="nt-email" title={T.notify.emailTitle}>
        <p className="type-body">{T.notify.emailBody(queuedEmails)}</p>
      </AdminBlock>
    </div>
  );
}
