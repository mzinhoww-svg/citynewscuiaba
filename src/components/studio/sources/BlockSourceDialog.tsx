"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ACTIONS, BLOCK_DIALOG as T } from "@/content/pt-BR/sources-admin-detail";
import { BLOCK_REASONS } from "@/content/pt-BR/sources-admin";
import { Button } from "../../ui/Button";
import { ModalShell } from "./ConfirmByTypingDialog";
import {
  ActionMessage,
  formDataOf,
  useFormAction,
  type ActionResult,
  type FormAction,
} from "./detail-shared";

export interface BlockSourceDialogProps {
  open: boolean;
  onClose: () => void;
  /** `block` escolhe o motivo; `unblock` pede a segunda aprovação, com justificativa. */
  mode: "block" | "unblock";
  sourceId: string;
  version: number;
  sourceName: string;
  /** `sourceStatusAction`. */
  action: FormAction;
  onDone?: (result: ActionResult) => void;
}

/**
 * Bloqueio de fonte (motivo por opção; "Pedido do veículo" explica a remoção das imagens) e pedido
 * de desbloqueio (justificativa obrigatória, decidido por outra pessoa).
 */
export function BlockSourceDialog(props: BlockSourceDialogProps) {
  return (
    <ModalShell
      open={props.open}
      onClose={props.onClose}
      title={props.mode === "block" ? T.title : T.unblockTitle}
    >
      <Body {...props} />
    </ModalShell>
  );
}

function Body({
  onClose,
  mode,
  sourceId,
  version,
  sourceName,
  action,
  onDone,
}: BlockSourceDialogProps) {
  const uid = useId();
  const [reason, setReason] = useState<string>("");
  const [justification, setJustification] = useState("");
  const { state, pending, submit } = useFormAction(action);
  const ready = !pending && (mode === "block" ? reason !== "" : justification.trim().length > 0);

  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onDone?.(state);
      onClose();
    }
  }, [state, onDone, onClose]);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (ready) submit(formDataOf(e.currentTarget));
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="id" value={sourceId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="action" value={mode} />
      <p className="type-body text-body">
        <strong className="font-semibold text-strong">{sourceName}</strong>.{" "}
        {mode === "block" ? T.intro : T.unblockIntro}
      </p>
      {mode === "block" ? (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 type-label text-16 text-strong">{T.reasonLegend}</legend>
          {BLOCK_REASONS.map((code) => {
            const r = T.reasons[code as keyof typeof T.reasons];
            return (
              <label
                key={code}
                className="flex min-h-tap cursor-pointer items-start gap-3 rounded-lg border border-line-control p-3 has-[:checked]:border-line-strong has-[:checked]:bg-section"
              >
                <input
                  type="radio"
                  name="reason"
                  value={code}
                  checked={reason === code}
                  onChange={() => setReason(code)}
                  className="mt-1 size-5 accent-(--action-primary)"
                />
                <span className="flex flex-col">
                  <span className="type-body font-semibold text-strong">{r.label}</span>
                  <span className="type-meta text-meta">{r.hint}</span>
                </span>
              </label>
            );
          })}
        </fieldset>
      ) : (
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-just`} className="type-label text-16 text-strong">
            {T.justification}
          </label>
          <textarea
            id={`${uid}-just`}
            name="justification"
            rows={3}
            maxLength={500}
            value={justification}
            onChange={(e) => setJustification(e.target.value)}
            aria-describedby={`${uid}-just-dica`}
            className="border-control control-field w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
          />
          <p id={`${uid}-just-dica`} className="type-meta text-meta">
            {T.justificationHint}
          </p>
        </div>
      )}
      {state && !state.ok && <ActionMessage state={state} />}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button size="md" variant="outline" onClick={onClose}>
          {ACTIONS.cancel}
        </Button>
        <Button type="submit" size="md" variant="primary" disabled={!ready}>
          {pending ? ACTIONS.working : mode === "block" ? T.submit : T.unblockSubmit}
        </Button>
      </div>
    </form>
  );
}
