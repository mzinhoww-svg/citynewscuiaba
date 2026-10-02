"use client";

import { lazy, Suspense } from "react";
import { LOAD_FAILED } from "@/content/pt-BR/system-min";
import type { ErrorStateProps } from "./ErrorState";

/*
 * Fronteira de erro sem custo no caminho feliz (B-018): o `error.tsx` de cada segmento entra no
 * bundle inicial de toda página, então ele só carrega o `ErrorState` (botões, textos e ícones)
 * quando há um erro de verdade.
 */

/** Sem rede o `ErrorState` não chega: mensagem mínima e "Tentar de novo". */
function LoadFailed({ reset }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className="mx-auto flex max-w-page flex-col items-start gap-4 px-gutter py-16"
    >
      <p className="type-body text-strong">{LOAD_FAILED.text}</p>
      <button type="button" onClick={reset} className="min-h-tap font-semibold text-link underline">
        {LOAD_FAILED.retry}
      </button>
    </div>
  );
}

const ErrorState = lazy(() =>
  import("./ErrorState")
    .then((m) => ({ default: m.ErrorState }))
    .catch(() => ({ default: LoadFailed })),
);

/** Mesmo contrato do `ErrorState`; use nos `error.tsx` das rotas públicas. */
export function LazyErrorState(props: ErrorStateProps) {
  return (
    <Suspense fallback={null}>
      <ErrorState {...props} />
    </Suspense>
  );
}
