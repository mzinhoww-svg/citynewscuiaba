"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { ACTIONS } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { Button } from "../../ui/Button";
import { IconButton } from "../../ui/IconButton";
import {
  ActionMessage,
  formDataOf,
  useFormAction,
  type ActionResult,
  type FormAction,
} from "./detail-shared";

export interface ModalShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  className?: string;
}

/**
 * Diálogo nativo (`<dialog>` com `showModal()`): foco preso, Esc fecha e o foco volta ao gatilho ao
 * fechar. Fica montado e só abre quando `open`, para o navegador devolver o foco ao gatilho.
 */
export function ModalShell({ open, onClose, title, children, className }: ModalShellProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) {
      if (typeof el.showModal === "function") el.showModal();
      else el.setAttribute("open", "");
    }
    if (!open && el.open) {
      if (typeof el.close === "function") el.close();
      else el.removeAttribute("open");
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-auto w-full max-w-xl bg-transparent p-4 backdrop:bg-overlay backdrop:backdrop-blur-scrim open:motion-safe:animate-fade-in"
    >
      {open && (
        <div
          className={cx(
            "relative flex max-h-[85dvh] flex-col gap-4 overflow-y-auto rounded-xl bg-card-white p-6 pr-14 text-left shadow-dialog",
            className,
          )}
        >
          <span className="absolute top-2 right-2">
            <IconButton
              icon="x"
              variant="ghost"
              size={44}
              label={ACTIONS.close}
              onClick={onClose}
            />
          </span>
          <h2 id={titleId} className="type-section text-strong">
            {title}
          </h2>
          {children}
        </div>
      )}
    </dialog>
  );
}

export interface ConfirmByTypingDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Explicação do que acontece. */
  intro: ReactNode;
  /** Texto que a pessoa precisa digitar igual (o nome da fonte). */
  confirmText: string;
  confirmLabel: string;
  confirmHint?: string;
  /** Campo de motivo obrigatório (`reason`); sem ele, só a confirmação digitada. */
  reasonLabel?: string;
  reasonHint?: string;
  submitLabel: string;
  action: FormAction;
  /** Campos fixos enviados junto (`id`, `version`, `action`). */
  hidden: Record<string, string>;
  onDone?: (result: ActionResult) => void;
}

/**
 * Confirmação por digitação (padrão das ações de contingência do P5): o botão só habilita quando o
 * nome digitado é idêntico ao da fonte e o motivo foi preenchido. Erros do servidor ficam dentro do
 * diálogo e o texto digitado é mantido.
 */
export function ConfirmByTypingDialog(props: ConfirmByTypingDialogProps) {
  return (
    <ModalShell open={props.open} onClose={props.onClose} title={props.title}>
      <ConfirmBody {...props} />
    </ModalShell>
  );
}

/** Corpo do diálogo: só existe enquanto aberto, então o texto digitado zera a cada abertura. */
function ConfirmBody({
  onClose,
  intro,
  confirmText,
  confirmLabel,
  confirmHint,
  reasonLabel,
  reasonHint,
  submitLabel,
  action,
  hidden,
  onDone,
}: ConfirmByTypingDialogProps) {
  const uid = useId();
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const { state, pending, submit } = useFormAction(action);
  const matches = typed.trim() === confirmText.trim() && confirmText.trim() !== "";
  const ready = matches && (reasonLabel === undefined || reason.trim() !== "") && !pending;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!ready) return;
    submit(formDataOf(e.currentTarget));
  };

  // Sucesso: avisa quem abriu (a tela recarrega os dados) e fecha.
  const handled = useRef<ActionResult | null>(null);
  useEffect(() => {
    if (state?.ok && handled.current !== state) {
      handled.current = state;
      onDone?.(state);
      onClose();
    }
  }, [state, onDone, onClose]);

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <div className="type-body text-body">{intro}</div>
        {reasonLabel && (
          <div className="flex flex-col gap-2">
            <label htmlFor={`${uid}-motivo`} className="type-label text-16 text-strong">
              {reasonLabel}
            </label>
            <textarea
              id={`${uid}-motivo`}
              name="reason"
              rows={3}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-describedby={reasonHint ? `${uid}-motivo-dica` : undefined}
              className="border-control control-field w-full rounded-lg bg-input px-4 py-3 type-body text-strong"
            />
            {reasonHint && (
              <p id={`${uid}-motivo-dica`} className="type-meta text-meta">
                {reasonHint}
              </p>
            )}
          </div>
        )}
        <div className="flex flex-col gap-2">
          <label htmlFor={`${uid}-confirma`} className="type-label text-16 text-strong">
            {confirmLabel}
          </label>
          <input
            id={`${uid}-confirma`}
            type="text"
            autoComplete="off"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-describedby={confirmHint ? `${uid}-confirma-dica` : undefined}
            className="border-control control-field h-input w-full rounded-lg bg-input px-4 type-body text-strong"
          />
          {confirmHint && (
            <p id={`${uid}-confirma-dica`} className="type-meta text-meta">
              {confirmHint}
            </p>
          )}
        </div>
        {state && !state.ok && <ActionMessage state={state} />}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Button size="md" variant="outline" onClick={onClose}>
            {ACTIONS.cancel}
          </Button>
          <Button type="submit" size="md" variant="primary" disabled={!ready}>
            {pending ? ACTIONS.working : submitLabel}
          </Button>
        </div>
      </form>
    </>
  );
}
