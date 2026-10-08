"use client";

import { lazy, Suspense, useEffect } from "react";
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

const RELOAD_KEY = "cn_error_reload";

/** Avisa o servidor o que quebrou no navegador (só log; falha de rede é ignorada). */
function reportClientError(error: Error | undefined, digest: string | undefined) {
  try {
    const body = JSON.stringify({
      message: error?.message,
      stack: error?.stack,
      path: location.pathname,
      digest,
    });
    navigator.sendBeacon?.("/api/client-error", new Blob([body], { type: "application/json" }));
  } catch {
    // o aviso é opcional
  }
}

/**
 * Erro sem `digest` nasceu no navegador, tipicamente aba ou cópia em cache de antes de um deploy
 * pedindo arquivos que já mudaram. Recarrega uma vez por aba antes de mostrar o erro.
 */
function useReloadOnceOnClientError(digest: string | undefined) {
  useEffect(() => {
    if (digest) return;
    try {
      if (window.sessionStorage.getItem(RELOAD_KEY)) return;
      window.sessionStorage.setItem(RELOAD_KEY, "1");
      window.location.reload();
    } catch {
      // sem armazenamento: não recarrega sozinho (evita laço); o botão faz o mesmo
    }
  }, [digest]);
}

/** Mesmo contrato do `ErrorState`; use nos `error.tsx` das rotas públicas. */
export function LazyErrorState({
  error,
  ...props
}: ErrorStateProps & { error?: Error & { digest?: string } }) {
  const digest = props.digest;
  useEffect(() => {
    reportClientError(error, digest);
  }, [error, digest]);
  useReloadOnceOnClientError(props.digest);
  return (
    <Suspense fallback={null}>
      <ErrorState {...props} />
    </Suspense>
  );
}
