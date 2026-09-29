"use client";

import { useId, useState } from "react";
import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { PUSH_ADMIN_TEXT, PUSH_QUEUE_TEXT } from "@/content/pt-BR/notifications-admin";
import type { QueueRow } from "@/lib/db/queries/push-admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TextInput } from "../sources/fields";
import { PushPreview } from "./PushPreview";

export type DecideMode = "decide" | "cancel";

export interface DecideDialogProps {
  open: boolean;
  row: QueueRow;
  /** `decide`: aprovar/recusar (pendente); `cancel`: cancelar com motivo. */
  mode: DecideMode;
  /** Quem abriu é quem pediu: a aprovação precisa ser de outra pessoa. */
  isOwnRequest?: boolean;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
  onCancelSend: (reason: string) => void;
}

/**
 * Revisar pedido (spec §10.3): prévia nas três plataformas, texto, público, quando, quem pediu
 * e justificativa; Aprovar, Recusar (motivo obrigatório) ou Cancelar (motivo). Quem pediu vê o
 * aviso de que a aprovação precisa ser de outra pessoa (servidor e banco recusam igual).
 */
export function DecideDialog({
  open,
  row,
  mode,
  isOwnRequest = false,
  busy = false,
  error,
  onCancel,
  onApprove,
  onReject,
  onCancelSend,
}: DecideDialogProps) {
  const T = PUSH_QUEUE_TEXT.dialog;
  const uid = useId().replace(/:/g, "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);
  const askingReason = mode === "cancel" || rejecting;

  const submitReason = () => {
    if (!reason.trim()) {
      setMissing(true);
      return;
    }
    if (mode === "cancel") onCancelSend(reason.trim());
    else onReject(reason.trim());
  };

  return (
    <Dialog open={open} title={T.title} onClose={onCancel} wide>
      <div className="flex flex-col gap-4 text-left">
        <PushPreview title={row.title} body={row.body} originLabel={row.originLabel} />
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="type-meta text-meta">{T.kind}</dt>
            <dd className="type-body font-semibold text-strong">
              {PUSH_ADMIN_TEXT.kind[row.kind]}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.article}</dt>
            <dd className="type-body text-strong">{row.article.title}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.audience}</dt>
            <dd className="type-body text-strong">
              {row.audienceLabel}
              {row.reach !== null && (
                <span className="type-meta text-meta"> · {PUSH_QUEUE_TEXT.reach(row.reach)}</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.when}</dt>
            <dd className="type-body text-strong">
              {row.scheduledAt ? fullDateTime(row.scheduledAt) : PUSH_QUEUE_TEXT.now}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.requestedBy}</dt>
            <dd className="type-body text-strong">
              {row.requestedBy?.name ?? PUSH_HISTORY_SYSTEM}
            </dd>
            <dd className="type-meta text-meta">{fullDateTime(row.requestedAt)}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.justification}</dt>
            <dd className="type-body text-strong">{row.justification ?? T.noJustification}</dd>
          </div>
        </dl>
        {mode === "decide" && isOwnRequest && (
          <p role="note" className="rounded-md bg-atencao-soft px-3 py-2 type-body text-strong">
            {T.selfNote}
          </p>
        )}
        {askingReason && (
          <TextInput
            id={`${uid}-motivo`}
            label={mode === "cancel" ? T.cancelReason : T.rejectReason}
            value={reason}
            onChange={(v) => {
              setReason(v);
              setMissing(false);
            }}
            error={missing ? (mode === "cancel" ? T.cancelRequired : T.rejectRequired) : null}
          />
        )}
        {error && (
          <p role="alert" className="type-body text-danger">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-wrap justify-end gap-2.5">
          {mode === "cancel" ? (
            <>
              <Button size="md" variant="outline" onClick={onCancel} disabled={busy}>
                {T.close}
              </Button>
              <Button size="md" variant="danger" disabled={busy} onClick={submitReason}>
                {T.confirmCancel}
              </Button>
            </>
          ) : rejecting ? (
            <>
              <Button
                size="md"
                variant="outline"
                onClick={() => setRejecting(false)}
                disabled={busy}
              >
                {T.close}
              </Button>
              <Button size="md" variant="danger" disabled={busy} onClick={submitReason}>
                {T.confirmReject}
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
                {T.reject}
              </Button>
              <Button size="md" onClick={onApprove} disabled={busy || isOwnRequest}>
                {T.approve}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}

const PUSH_HISTORY_SYSTEM = "Sistema";
