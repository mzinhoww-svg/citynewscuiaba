"use client";

import { useCallback } from "react";

export interface ModalDialogOptions {
  /** Trava a rolagem da página enquanto o diálogo está aberto (gavetas de altura total). */
  lockScroll?: boolean;
}

/**
 * Ref de callback para um `<dialog>` modal que só existe enquanto está aberto. Ao montar, guarda
 * o elemento que tinha o foco e chama `showModal()`; ao desmontar, chama `close()` com o
 * elemento ainda no documento (o navegador sai da camada superior e solta o `inert` da página)
 * e devolve o foco a quem abriu, para ele nunca cair no `body`.
 *
 * Usa a limpeza de ref do React 19, que roda antes de o nó sair do DOM.
 */
export function useModalDialog({ lockScroll = false }: ModalDialogOptions = {}) {
  return useCallback(
    (el: HTMLDialogElement | null) => {
      if (!el) return;
      const active = document.activeElement;
      const returnTo = active instanceof HTMLElement && active !== document.body ? active : null;
      if (!el.open) el.showModal?.();
      const root = document.documentElement;
      const overflowBefore = root.style.overflow;
      if (lockScroll) root.style.overflow = "hidden";
      return () => {
        if (el.open) el.close?.();
        if (lockScroll) root.style.overflow = overflowBefore;
        if (returnTo?.isConnected) returnTo.focus();
      };
    },
    [lockScroll],
  );
}
