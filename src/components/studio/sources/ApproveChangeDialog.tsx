"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ACTIONS,
  APPROVE_DIALOG as T,
  CRITICAL_FIELD_TEXT,
  criticalValueText,
} from "@/content/pt-BR/sources-admin-detail";
import { Button } from "../../ui/Button";
import { Icon } from "../../ui/Icon";
import { ModalShell } from "./ConfirmByTypingDialog";
import { ActionMessage, useFormAction, type FormAction } from "./detail-shared";

export interface ApprovalRequestView {
  id: string;
  /** Campo em snake_case, como no alvo do pedido (`image_policy`). */
  field: string;
  /** Valor pedido (`reproduction`). */
  value: string;
  /** Valor atual, já em texto ("Sem imagens"). */
  currentText: string;
  justification: string;
  requesterName: string | null;
  /** Data e hora do pedido já formatadas. */
  requestedAt: string;
}

export interface ApproveChangeDialogProps {
  request: ApprovalRequestView;
  /** Como quem vê se relaciona com o pedido: quem pediu nunca decide. */
  stance: "decider" | "requester" | "observer";
  /** `decideApprovalAction` (campos `id` e `decision`). */
  decide: FormAction;
}

/**
 * Pedido de mudança crítica na fonte: linha "Aguardando segunda aprovação" com o botão "Ver pedido"
 * e o diálogo com o diff, a justificativa e quem pediu. "Aprovar e aplicar" e "Recusar" só para
 * quem decide; quem pediu lê que a aprovação precisa ser de outra pessoa (também imposto no banco).
 */
export function ApproveChangeDialog({ request, stance, decide }: ApproveChangeDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { state, pending, submit } = useFormAction(decide);
  const what = CRITICAL_FIELD_TEXT[request.field] ?? request.field;
  const to = criticalValueText(request.field, request.value);
  const who = request.requesterName ?? T.unknownPerson;

  const send = (decision: "approve" | "reject") => {
    const fd = new FormData();
    fd.set("id", request.id);
    fd.set("decision", decision);
    submit(fd);
  };

  const close = () => {
    setOpen(false);
    if (state?.ok) router.refresh();
  };

  return (
    <div data-approval={request.id} className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <p className="flex min-w-0 flex-1 basis-64 items-start gap-2 type-body text-strong">
        <Icon name="clock" size={18} className="mt-1 shrink-0 text-warn" />
        <span>{T.banner(`${what} → ${to}`, who)}</span>
      </p>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {T.openLabel}
      </Button>
      <ModalShell open={open} onClose={close} title={T.title}>
        <p className="type-meta text-meta">{T.requestedBy(who, request.requestedAt)}</p>
        <section aria-labelledby={`dif-${request.id}`} className="flex flex-col gap-2">
          <h3 id={`dif-${request.id}`} className="type-label text-16 text-strong">
            {T.diffLegend}: {what}
          </h3>
          <dl className="grid grid-cols-1 gap-3 rounded-lg border border-line-section bg-section p-4 sm:grid-cols-2">
            <div>
              <dt className="type-meta text-meta">{T.from}</dt>
              <dd className="type-body font-semibold text-strong">{request.currentText}</dd>
            </div>
            <div>
              <dt className="type-meta text-meta">{T.to}</dt>
              <dd className="type-body font-semibold text-strong">{to}</dd>
            </div>
          </dl>
        </section>
        <section aria-labelledby={`jus-${request.id}`} className="flex flex-col gap-1">
          <h3 id={`jus-${request.id}`} className="type-label text-16 text-strong">
            {T.justification}
          </h3>
          <p className="type-body text-body">{request.justification}</p>
        </section>
        {state && <ActionMessage state={state} />}
        {stance === "decider" && !state?.ok && (
          <>
            <p className="type-meta text-meta">{T.effectNote}</p>
            <div className="flex flex-wrap items-center justify-end gap-3">
              <Button size="md" variant="outline" disabled={pending} onClick={() => send("reject")}>
                {T.reject}
              </Button>
              <Button size="md" disabled={pending} onClick={() => send("approve")}>
                {pending ? ACTIONS.working : T.approve}
              </Button>
            </div>
            <p className="type-meta text-meta">{T.rejectHint}</p>
          </>
        )}
        {stance === "requester" && <InlineNote>{T.requester}</InlineNote>}
        {stance === "observer" && <InlineNote>{T.observer}</InlineNote>}
        {state?.ok && (
          <div className="flex justify-end">
            <Button size="md" variant="outline" onClick={close}>
              {ACTIONS.close}
            </Button>
          </div>
        )}
      </ModalShell>
    </div>
  );
}

function InlineNote({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-2 rounded-lg border border-line-section bg-atencao-soft p-3 type-body text-strong">
      <Icon name="circle-alert" size={18} className="mt-1 shrink-0 text-warn" />
      {children}
    </p>
  );
}
