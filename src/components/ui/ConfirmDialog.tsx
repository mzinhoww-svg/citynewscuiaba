"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { Button } from "./Button";
import { Dialog } from "./Dialog";

export interface ConfirmDialogProps {
  open: boolean;
  /** Pergunta com o nome de quem ou do quê ("Revogar o acesso de administração de Ana?"). */
  title: ReactNode;
  /** O que muda depois de confirmar. */
  body: ReactNode;
  /** Verbo + objeto ("Revogar acesso de Ana", "Apagar matéria"); nunca só "Confirmar". */
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
  /** Ação irreversível: botão sólido de perigo (`Button variant="destructive"`). */
  destructive?: boolean;
  /** Ação em andamento: as duas ações ficam desabilitadas e a ação mostra o carregamento. */
  pending?: boolean;
  /** Texto da ação durante `pending` ("Salvando…" por padrão). */
  pendingLabel?: string;
}

/** Rótulos longos ("Revogar acesso de …") quebram linha em vez de vazar da caixa estreita. */
const WRAP = "h-auto! min-h-tap grow py-2.5 leading-tight whitespace-normal! text-balance";

/**
 * Confirmação de ação sensível (item 35): diz em quem ou no quê a ação cai e o efeito.
 * Cancelar à esquerda (primeiro no DOM), ação à direita. Cliques repetidos chamam `onConfirm`
 * uma vez só, até a promessa terminar, `pending` voltar a falso ou o diálogo fechar. Ao fechar,
 * o foco volta para o elemento que abriu o diálogo (nunca cai no `body`).
 *
 * ```tsx
 * <ConfirmDialog open={open} title="Apagar a matéria?" body="Ela sai do portal."
 *   confirmLabel="Apagar matéria" destructive pending={pending}
 *   onConfirm={() => start(remove)} onClose={() => setOpen(false)} />
 * ```
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  onConfirm,
  onClose,
  destructive = false,
  pending = false,
  pendingLabel,
}: ConfirmDialogProps) {
  const firing = useRef(false);
  const [locked, setLocked] = useState(false);

  // Efeito de layout: roda antes do `showModal()` do Dialog (efeito comum do filho), que já
  // moveria o foco para dentro do diálogo.
  useLayoutEffect(() => {
    if (!open) return;
    const trigger = document.activeElement;
    return () => {
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, [open]);

  // Libera a ação ao fechar ou quando o envio do chamador termina (ajuste no render, sem efeito).
  const [seen, setSeen] = useState({ open, pending });
  if (seen.open !== open || seen.pending !== pending) {
    setSeen({ open, pending });
    if (!open || !pending) setLocked(false);
  }
  useEffect(() => {
    if (!open || !pending) firing.current = false;
  }, [open, pending]);

  const confirm = () => {
    if (firing.current || pending) return;
    firing.current = true;
    setLocked(true);
    const result = onConfirm();
    if (result instanceof Promise) {
      void result.finally(() => {
        firing.current = false;
        setLocked(false);
      });
    }
  };

  return (
    <Dialog
      open={open}
      title={title}
      onClose={onClose}
      actions={
        <div className="flex w-full flex-wrap gap-3">
          <Button size="md" variant="outline" disabled={pending} onClick={onClose} className={WRAP}>
            {UI.cancel}
          </Button>
          <Button
            size="md"
            variant={destructive ? "destructive" : "primary"}
            loading={pending}
            loadingLabel={pendingLabel}
            disabled={locked}
            onClick={confirm}
            className={WRAP}
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <p>{body}</p>
    </Dialog>
  );
}
