"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

/** Lado em que a lista ainda tem conteúdo fora da vista (lido por `scroll-fade`). */
export type ScrollFade = "none" | "start" | "end" | "both";

export interface ScrollEdges<T extends HTMLElement> {
  ref: RefObject<T | null>;
  /** O conteúdo passa da largura visível (há o que rolar). */
  scrollable: boolean;
  fade: ScrollFade;
}

/**
 * Mede uma lista de rolagem horizontal: se há o que rolar e de que lado ainda há itens.
 * Atualiza ao rolar, ao redimensionar a janela e quando o próprio elemento muda de tamanho.
 * No servidor e antes de medir: não rolável, sem esmaecimento.
 */
export function useScrollEdges<T extends HTMLElement>(): ScrollEdges<T> {
  const ref = useRef<T>(null);
  const [state, setState] = useState<{ scrollable: boolean; fade: ScrollFade }>({
    scrollable: false,
    fade: "none",
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const scrollable = el.scrollWidth > el.clientWidth + 1;
      const start = scrollable && el.scrollLeft > 1;
      const end = scrollable && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      const fade: ScrollFade = start && end ? "both" : start ? "start" : end ? "end" : "none";
      setState((s) => (s.scrollable === scrollable && s.fade === fade ? s : { scrollable, fade }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    const ro = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, []);

  return { ref, ...state };
}
