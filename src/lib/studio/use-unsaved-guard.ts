"use client";

import { useEffect, useRef } from "react";
import { UNSAVED_TEXT } from "@/content/pt-BR/studio";

/** Link que leva a outra página deste site, na mesma aba (o único caso que perde o formulário). */
function leavingLink(e: MouseEvent): HTMLAnchorElement | null {
  if (e.defaultPrevented || e.button !== 0) return null;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const target = e.target;
  if (!(target instanceof Element)) return null;
  const a = target.closest("a[href]");
  if (!(a instanceof HTMLAnchorElement)) return null;
  if (a.hasAttribute("download")) return null;
  const t = a.getAttribute("target");
  if (t && t !== "_self") return null;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  // Âncora na mesma página não descarta nada.
  if (url.pathname === window.location.pathname && url.search === window.location.search) {
    return null;
  }
  return a;
}

/**
 * Proteção de alterações não salvas (item 47, E-03). Com `dirty`, fechar ou recarregar a aba pede
 * a confirmação do navegador (`beforeunload`) e clicar num link interno pede `confirm(message)`;
 * cancelar mantém a pessoa na página. O clique é lido na fase de captura do `document`, antes do
 * `next/link`: cancelado, a navegação do cliente nem começa.
 *
 * ```tsx
 * useUnsavedGuard(dirty);
 * ```
 */
export function useUnsavedGuard(dirty: boolean, message: string = UNSAVED_TEXT.leave): void {
  const text = useRef(message);
  useEffect(() => {
    text.current = message;
  }, [message]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Navegadores antigos só mostram o aviso com `returnValue` preenchido.
      e.returnValue = text.current;
    };
    const onClick = (e: MouseEvent) => {
      if (!leavingLink(e)) return;
      if (window.confirm(text.current)) return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);
}
