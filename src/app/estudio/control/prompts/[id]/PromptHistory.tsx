import { Button } from "@/components";
import { AI_ADMIN_TEXT as T, PROMPT_STATUS_LABEL } from "@/content/pt-BR/control-ai";
import type { PromptRow } from "@/lib/db/queries/ai-admin";
import { formatDateTime } from "@/lib/format/date";
import { approvePublishAction, requestPublicationAction, rollbackAction } from "./actions";

export interface PromptHistoryProps {
  agentId: string;
  rows: PromptRow[];
  viewerId: string;
  /** Operação de IA: cria, propõe e restaura versões. */
  canCreate: boolean;
  /** Admin ou editor-chefe: decide a publicação de versões de outras pessoas. */
  canDecide: boolean;
}

function statusOf(v: PromptRow): string {
  if (v.status === "pending" && v.rejected) return T.statusRejected;
  return PROMPT_STATUS_LABEL[v.status] ?? v.status;
}

/** Histórico de versões (O12): situação, autoria, quem aprovou, comparação e ações por linha. */
export function PromptHistory({
  agentId,
  rows,
  viewerId,
  canCreate,
  canDecide,
}: PromptHistoryProps) {
  return (
    <div
      role="region"
      aria-label={T.historyCaption}
      tabIndex={0}
      className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
    >
      <table className="w-full min-w-[64rem] border-collapse text-left">
        <caption className="sr-only">{T.historyCaption}</caption>
        <thead className="border-b border-line-subtle bg-section type-meta text-meta">
          <tr>
            <th scope="col" className="px-3 py-3">
              {T.colVer}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colStatus}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colAuthor}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colApprover}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colCreated}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colWhy}
            </th>
            <th scope="col" className="px-3 py-3">
              {T.colActions}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => {
            const mine = v.pendingApproval?.requestedBy === viewerId;
            return (
              <tr key={v.id} className="border-b border-line-subtle align-top last:border-b-0">
                <th scope="row" className="px-3 py-3 type-body font-semibold text-strong">
                  {v.version}
                </th>
                <td className="px-3 py-3 type-body">
                  <span className="font-semibold text-strong">{statusOf(v)}</span>
                  {v.rollbackOf !== null && (
                    <span className="block type-meta text-meta">{T.rollbackOf(v.rollbackOf)}</span>
                  )}
                </td>
                <td className="px-3 py-3 type-body">
                  {v.authorName ?? (v.approvedBy.length === 0 ? T.unknownPerson : T.systemAuthor)}
                </td>
                <td className="px-3 py-3 type-body">
                  {v.approvedBy.some((a) => a !== v.authorId)
                    ? (v.approverName ?? T.unknownPerson)
                    : T.nobody}
                </td>
                <td className="px-3 py-3 type-body tabular-nums">{formatDateTime(v.createdAt)}</td>
                <td className="max-w-[22rem] px-3 py-3 type-body">{v.rationale}</td>
                <td className="px-3 py-3">
                  <div className="flex flex-col items-start gap-2">
                    {v.status !== "production" && (
                      <a
                        href={`/estudio/control/prompts/${agentId}?comparar=${v.version}#prompt-comparacao`}
                        aria-label={T.compareNamed(v.version)}
                        className="type-body text-link underline underline-offset-2"
                      >
                        {T.compareLink}
                      </a>
                    )}
                    {v.status === "draft" && canCreate && (
                      <form action={requestPublicationAction}>
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="id" value={v.id} />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline"
                          aria-label={T.proposeExistingNamed(v.version)}
                        >
                          {T.proposeExisting}
                        </Button>
                      </form>
                    )}
                    {v.status === "pending" && v.pendingApproval && (
                      <>
                        <p className="type-meta text-meta">{T.waitingApproval}</p>
                        {!mine && canDecide && (
                          <form action={approvePublishAction}>
                            <input type="hidden" name="agentId" value={agentId} />
                            <input type="hidden" name="id" value={v.id} />
                            <input type="hidden" name="version" value={v.version} />
                            <Button
                              type="submit"
                              size="sm"
                              aria-label={T.approveAndPublishNamed(v.version)}
                            >
                              {T.approveAndPublish}
                            </Button>
                          </form>
                        )}
                      </>
                    )}
                    {(v.status === "archived" || v.status === "reverted") && canCreate && (
                      <form action={rollbackAction} className="flex flex-col items-start gap-2">
                        <input type="hidden" name="agentId" value={agentId} />
                        <input type="hidden" name="toVersion" value={v.version} />
                        <label htmlFor={`rb-${v.version}`} className="type-meta text-meta">
                          {T.rollbackWhyLabel}
                        </label>
                        <input
                          id={`rb-${v.version}`}
                          name="justification"
                          required
                          maxLength={500}
                          className="border-control h-tap w-[16rem] rounded-lg bg-input px-3 type-body text-strong"
                        />
                        <Button
                          type="submit"
                          size="sm"
                          variant="outline-strong"
                          icon="refresh-cw"
                          aria-label={T.rollbackNamed(v.version)}
                        >
                          {T.rollback}
                        </Button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
