"use client";

import { useEffect, useRef, type ReactNode } from "react";

export interface OpenOnDesktopProps {
  summary: ReactNode;
  children: ReactNode;
  /** Largura mínima (px) a partir da qual o bloco abre sozinho. */
  minWidth?: number;
  className?: string;
}

/**
 * `<details>` que nasce recolhido (celular) e abre sozinho em tela larga. Depois que a pessoa
 * recolhe ou abre, a escolha dela vale; sem JavaScript fica recolhido e continua acessível.
 */
export function OpenOnDesktop({
  summary,
  children,
  minWidth = 1024,
  className,
}: OpenOnDesktopProps) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (
      el &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(`(min-width: ${minWidth}px)`).matches
    )
      el.open = true;
  }, [minWidth]);
  return (
    <details ref={ref} className={className}>
      {summary}
      {children}
    </details>
  );
}
