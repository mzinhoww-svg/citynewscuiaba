"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ADMIN_TEXT } from "@/content/pt-BR/admin";
import { Button } from "../../ui/Button";
import { Dialog } from "../../ui/Dialog";

export interface ConfirmDialogProps {
  /** Pergunta com o nome de quem ou do quê ("Revogar o acesso de administração de Ana?"). */
  title: ReactNode;
  /** O que muda depois de confirmar. */
  effect: ReactNode;
  /** Verbo + objeto ("Revogar acesso de Ana"); nunca só "Confirmar". */
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Confirmação de ação sensível da Administração (item 24): diz em quem ou no quê a ação cai e
 * o efeito. Ao fechar, o foco volta para o botão que abriu o diálogo (nunca cai no `body`).
 */
export function ConfirmDialog({
  title,
  effect,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  // Lido no render: o `showModal()` do Dialog (efeito do filho, que roda antes) já move o foco.
  const [trigger] = useState(() =>
    typeof document === "undefined" ? null : document.activeElement,
  );
  useEffect(
    () => () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    },
    [trigger],
  );

  return (
    <Dialog
      open
      title={title}
      onClose={onCancel}
      actions={
        <>
          <Button size="md" disabled={busy} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button size="md" variant="outline" disabled={busy} onClick={onCancel}>
            {ADMIN_TEXT.cancel}
          </Button>
        </>
      }
    >
      <p>{effect}</p>
    </Dialog>
  );
}
