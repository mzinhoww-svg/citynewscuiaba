"use client";

import { useEffect, useRef } from "react";

export interface ReadingProgressProps {
  /** Id do elemento cujo fim marca 100%. */
  targetId: string;
}

/**
 * Barra de progresso de leitura da matéria (P03, aceite): linha Urucum no topo da janela.
 * Decorativa (`aria-hidden`); a largura muda sem animação.
 *
 * ```tsx
 * <ReadingProgress targetId="corpo" />
 * ```
 */
export function ReadingProgress({ targetId }: ReadingProgressProps) {
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = document.getElementById(targetId);
    if (!el || !bar.current) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const pct = total <= 0 ? (rect.top < 0 ? 1 : 0) : Math.min(1, Math.max(0, -rect.top / total));
      if (bar.current) bar.current.style.transform = `scaleX(${pct})`;
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);
  return (
    <div
      ref={bar}
      aria-hidden="true"
      data-testid="reading-progress"
      className="fixed inset-x-0 top-0 z-sticky h-0.75 origin-left scale-x-0 bg-accent"
    />
  );
}
