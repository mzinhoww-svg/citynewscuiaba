import type { ReactNode } from "react";

/** Texto só para leitores de tela (nome de controle, resumo de gráfico, contexto de link). */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>;
}
