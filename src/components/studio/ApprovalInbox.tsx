"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { APPROVALS_TEXT as T, KIND_TEXT, targetText } from "@/content/pt-BR/approvals";
import type { ApprovalItem } from "@/lib/db/queries/approvals";
import { applyHref, approvalHref } from "@/lib/approvals/targets";
import { formatDateTime } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Icon } from "../ui/Icon";
import { TextField } from "../ui/TextField";

export interface ApprovalReply {
  ok: boolean;
  message: string;
}

export interface ApprovalInboxProps {
  pending: ApprovalItem[];
  recent: ApprovalItem[];
  currentUserId: string;
  /** Tipos que a pessoa da sessão pode decidir (`APPROVER_ACTION` × papéis). */
  decidable: string[];
  decide: (i: {
    id: string;
    decision: "approve" | "reject";
    reason?: string;
  }) => Promise<ApprovalReply>;
  className?: string;
}

const who = (p: { name: string | null }) => p.name ?? T.someone;

/**
 * Caixa de aprovações (P5-T1): pedidos abertos com quem pediu, justificativa e "Revisar"
 * (aprovar e aplicar, ou recusar com motivo); quem pediu lê "A aprovação precisa ser de outra
 * pessoa"; mudança crítica de fonte se decide no detalhe da fonte. Abaixo, as últimas decisões.
 */
export function ApprovalInbox({
  pending,
  recent,
  currentUserId,
  decidable,
  decide,
  className,
}: ApprovalInboxProps) {
  const router = useRouter();
  const [open, setOpen] = useState<ApprovalItem | null>(null);
  const [status, setStatus] = useState<ApprovalReply | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);

  const close = () => {
    setOpen(null);
    setError(null);
    if (trigger) setTimeout(() => trigger.focus(), 0);
  };

  function run(id: string, decision: "approve" | "reject", reason?: string) {
    start(async () => {
      const r = await decide(reason === undefined ? { id, decision } : { id, decision, reason });
      if (!r.ok) {
        setError(r.message);
        return;
      }
      close();
      setStatus(r);
      router.refresh();
    });
  }

  return (
    <div className={cx("flex flex-col gap-8", className)}>
      <p role="status" aria-live="polite" className="min-h-6 type-body empty:hidden">
        {status && (
          <span className="inline-flex items-start gap-2 text-service">
            <Icon name="check" size={20} className="mt-0.5" />
            {status.message}
          </span>
        )}
      </p>

      <section aria-labelledby="pendentes" className="flex flex-col gap-3">
        <h2 id="pendentes" className="type-section text-strong">
          {T.pendingTitle(pending.length)}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-lg border border-line-subtle bg-card-white p-4 type-body text-meta">
            {T.emptyBody}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pending.map((a) => {
              const own = a.requestedBy.id === currentUserId;
              const can = decidable.includes(a.kind);
              const elsewhere = a.kind === "source.critical";
              return (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-lg border border-warn bg-atencao-soft p-4 md:flex-row md:items-start md:justify-between"
                >
                  <div className="flex min-w-0 flex-col gap-1">
                    <p className="type-meta text-meta">{KIND_TEXT[a.kind]}</p>
                    <p className="type-body font-semibold text-strong">{targetText(a.target)}</p>
                    <p className="type-body text-strong">{a.justification}</p>
                    <p className="type-meta text-meta">
                      {T.col.requestedBy} {who(a.requestedBy)} · {formatDateTime(a.createdAt)}
                    </p>
                    {own && (
                      <p className="flex items-center gap-2 type-meta font-medium text-strong">
                        <Icon name="info" size={16} />
                        {T.ownRequest}: {T.waitOther}
                      </p>
                    )}
                    {!own && !can && !elsewhere && (
                      <p className="type-meta text-meta">{T.noRole}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    {elsewhere ? (
                      <Button
                        href={approvalHref(a.kind, a.target)}
                        size="sm"
                        variant="outline-strong"
                      >
                        {T.reviewAt}
                      </Button>
                    ) : (
                      !own &&
                      can && (
                        <Button
                          size="sm"
                          variant="outline-strong"
                          onClick={(e) => {
                            setTrigger(e.currentTarget);
                            setError(null);
                            setOpen(a);
                          }}
                        >
                          {T.review}
                        </Button>
                      )
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="decididos" className="flex flex-col gap-3">
        <h2 id="decididos" className="type-section text-strong">
          {T.historyTitle}
        </h2>
        {recent.length === 0 ? (
          <p className="type-body text-meta">{T.historyEmpty}</p>
        ) : (
          <div
            role="region"
            aria-label={T.historyTitle}
            tabIndex={0}
            className="overflow-x-auto rounded-lg border border-line-subtle bg-card-white"
          >
            <table className="w-full min-w-[48rem] border-collapse text-left">
              <caption className="sr-only">{T.historyTitle}</caption>
              <thead className="border-b border-line-subtle bg-section type-meta text-meta">
                <tr>
                  {(["kind", "target", "requestedBy", "decidedBy", "status", "when"] as const).map(
                    (k) => (
                      <th key={k} scope="col" className="px-3 py-3">
                        {T.col[k]}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {recent.map((a) => (
                  <tr key={a.id} className="border-b border-line-subtle last:border-0">
                    <th scope="row" className="px-3 py-3 type-body font-medium text-strong">
                      {KIND_TEXT[a.kind]}
                    </th>
                    <td className="px-3 py-3 type-body text-body">
                      {a.kind === "source.critical" && a.target.kind === "source" ? (
                        <Link href={approvalHref(a.kind, a.target)} className="text-link underline">
                          {targetText(a.target)}
                        </Link>
                      ) : (
                        targetText(a.target)
                      )}
                    </td>
                    <td className="px-3 py-3 type-body text-body">{who(a.requestedBy)}</td>
                    <td className="px-3 py-3 type-body text-body">
                      {a.approvedBy ? who(a.approvedBy) : "—"}
                    </td>
                    <td className="px-3 py-3 type-body text-body">
                      {T.status[a.status] ?? a.status}
                      {a.status === "approved" && applyHref(a.kind, a.target) && (
                        <>
                          {" · "}
                          <Link
                            href={applyHref(a.kind, a.target) ?? "#"}
                            className="text-link underline"
                          >
                            {T.applyAt}
                          </Link>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-3 type-meta text-meta whitespace-nowrap">
                      {formatDateTime(a.decidedAt ?? a.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {open && (
        <ApprovalDecisionDialog
          approval={open}
          busy={busy}
          error={error}
          onCancel={close}
          onApprove={() => run(open.id, "approve")}
          onReject={(reason) => run(open.id, "reject", reason)}
        />
      )}
    </div>
  );
}

function ApprovalDecisionDialog({
  approval,
  busy,
  error,
  onCancel,
  onApprove,
  onReject,
}: {
  approval: ApprovalItem;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}) {
  const D = T.dialog;
  const uid = useId().replace(/:/g, "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  return (
    <Dialog open title={D.title} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="type-meta text-meta">{D.change}</dt>
            <dd className="type-body font-semibold text-strong">
              {KIND_TEXT[approval.kind]}: {targetText(approval.target)}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{D.requestedBy}</dt>
            <dd className="type-body text-strong">{who(approval.requestedBy)}</dd>
            <dd className="type-meta text-meta">{formatDateTime(approval.createdAt)}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{D.justification}</dt>
            <dd className="type-body text-strong">{approval.justification}</dd>
          </div>
        </dl>
        {rejecting && (
          <TextField
            id={`${uid}-recusa`}
            label={D.rejectReason}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setMissing(false);
            }}
            error={missing ? D.rejectRequired : undefined}
          />
        )}
        {error && (
          <p role="alert" className="type-body text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          {rejecting ? (
            <>
              <Button
                size="md"
                variant="outline"
                onClick={() => setRejecting(false)}
                disabled={busy}
              >
                {D.cancel}
              </Button>
              <Button
                size="md"
                variant="danger"
                disabled={busy}
                onClick={() => (reason.trim() ? onReject(reason.trim()) : setMissing(true))}
              >
                {D.confirmReject}
              </Button>
            </>
          ) : (
            <>
              <Button
                size="md"
                variant="outline"
                onClick={() => setRejecting(true)}
                disabled={busy}
              >
                {D.reject}
              </Button>
              <Button size="md" onClick={onApprove} disabled={busy}>
                {D.approve}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
