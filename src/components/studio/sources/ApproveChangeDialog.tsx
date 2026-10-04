"use client";

import { useId, useState } from "react";
import {
  CRITICAL_FIELD_TEXT,
  criticalValueText,
  fullDateTime,
} from "@/content/pt-BR/sources-admin";
import { DETAIL_TEXT, DIALOG_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";
import { TextInput } from "./fields";

export interface ApprovalLike {
  id: string;
  /** Coluna crítica (`image_policy`, `status`…). */
  field: string;
  value: string;
  requestedBy: { id: string; name: string | null };
  justification: string;
  createdAt: string;
}

export interface ApproveChangeDialogProps {
  open: boolean;
  approval: ApprovalLike;
  /** Valor atual do campo (para o diff "antes → depois"). */
  currentValue?: string | null;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

/** "política de imagem: nenhuma imagem → reprodução". */
export function approvalDiffText(a: ApprovalLike, currentValue?: string | null): string {
  const field = CRITICAL_FIELD_TEXT[a.field] ?? a.field;
  const to = criticalValueText(a.field, a.value);
  if (currentValue === undefined || currentValue === null) return `${field} → ${to}`;
  const from = a.field === "status" ? "bloqueada" : criticalValueText(a.field, currentValue);
  return `${field}: ${from} → ${to}`;
}

/**
 * Aprovar mudança crítica (spec §7.5, §8): diff, justificativa do pedido e quem pediu, com
 * "Aprovar e aplicar" e "Recusar" (motivo obrigatório). Quem pediu também pode decidir, se tiver o
 * papel (A-128); o histórico guarda quem pediu e quem aprovou.
 */
export function ApproveChangeDialog({
  open,
  approval,
  currentValue,
  busy = false,
  error,
  onCancel,
  onApprove,
  onReject,
}: ApproveChangeDialogProps) {
  const T = DIALOG_TEXT.approve;
  const uid = useId().replace(/:/g, "");
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState(false);

  return (
    <Dialog open={open} title={T.title} onClose={onCancel}>
      <div className="flex flex-col gap-4 text-left">
        <dl className="flex flex-col gap-3">
          <div>
            <dt className="type-meta text-meta">{T.change}</dt>
            <dd className="type-body font-semibold text-strong">
              {approvalDiffText(approval, currentValue)}
            </dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.requestedBy}</dt>
            <dd className="type-body text-strong">
              {approval.requestedBy.name ?? DETAIL_TEXT.pending.someone}
            </dd>
            <dd className="type-meta text-meta">{fullDateTime(approval.createdAt)}</dd>
          </div>
          <div>
            <dt className="type-meta text-meta">{T.justification}</dt>
            <dd className="type-body text-strong">{approval.justification}</dd>
          </div>
        </dl>
        {rejecting && (
          <TextInput
            id={`${uid}-recusa`}
            label={T.rejectReason}
            value={reason}
            onChange={(v) => {
              setReason(v);
              setMissing(false);
            }}
            error={missing ? T.rejectRequired : null}
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
                {DIALOG_TEXT.cancel}
              </Button>
              <Button
                size="md"
                variant="danger"
                disabled={busy}
                onClick={() => (reason.trim() ? onReject(reason.trim()) : setMissing(true))}
              >
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
              <Button size="md" onClick={onApprove} disabled={busy}>
                {T.approve}
              </Button>
            </>
          )}
        </div>
      </div>
    </Dialog>
  );
}
