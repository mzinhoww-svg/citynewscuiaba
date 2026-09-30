"use client";

import { lazy, Suspense } from "react";
import type { ErrorStateProps } from "./ErrorState";

/*
 * Fronteira de erro sem custo no caminho feliz (B-018): o `error.tsx` de cada segmento entra no
 * bundle inicial de toda página, então ele só carrega o `ErrorState` (botões, textos e ícones)
 * quando há um erro de verdade.
 */
const ErrorState = lazy(() => import("./ErrorState").then((m) => ({ default: m.ErrorState })));

/** Mesmo contrato do `ErrorState`; use nos `error.tsx` das rotas públicas. */
export function LazyErrorState(props: ErrorStateProps) {
  return (
    <Suspense fallback={null}>
      <ErrorState {...props} />
    </Suspense>
  );
}
