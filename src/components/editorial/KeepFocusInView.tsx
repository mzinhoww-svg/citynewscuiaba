"use client";

import { useEffect } from "react";

/**
 * Conteúdo que chega depois do foco (resultado de busca que substitui o esqueleto) empurra para
 * baixo quem já tem o foco, por exemplo um link do rodapé, e o deixa sob a barra inferior ou
 * fora da tela (WCAG 2.4.11). Ao montar, devolve o item focado à vista: `scrollIntoView` com
 * `block: "nearest"` respeita o `scroll-padding` das barras fixas e não rola se ele já está livre.
 *
 * ```tsx
 * <KeepFocusInView />
 * ```
 */
export function KeepFocusInView() {
  useEffect(() => {
    const el = document.activeElement;
    if (!(el instanceof HTMLElement) || el === document.body) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, []);
  return null;
}
