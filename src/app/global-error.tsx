"use client";

import { lazy, Suspense } from "react";
import { LOAD_FAILED } from "@/content/pt-BR/system-min";
import "@/styles/globals.css";

// Textos e botões só carregam quando o erro acontece (B-018): fora do caminho feliz, o
// `global-error` não pesa no JS inicial.
type BodyProps = { error: Error & { digest?: string }; reset: () => void };

/** Sem rede o conteúdo do erro não chega: mensagem mínima e "Tentar de novo". */
function BodyFailed({ reset }: BodyProps) {
  return (
    <main className="mx-auto flex max-w-page flex-col items-start gap-4 px-gutter py-16">
      <h1 className="type-screen-title text-strong">{LOAD_FAILED.title}</h1>
      <p className="max-w-read type-body text-body">{LOAD_FAILED.text}</p>
      <button
        type="button"
        onClick={reset}
        className="inline-flex min-h-tap cursor-pointer items-center rounded-pill bg-tinta px-6 font-semibold text-branco"
      >
        {LOAD_FAILED.retry}
      </button>
    </main>
  );
}

const Body = lazy(() =>
  import("./global-error-body")
    .then((m) => ({ default: m.default as (props: BodyProps) => React.JSX.Element }))
    .catch(() => ({ default: BodyFailed as (props: BodyProps) => React.JSX.Element })),
);

/**
 * Erro no layout raiz (P25): substitui o documento inteiro, então traz html, body e o estilo
 * global. Sem dependências do layout (fontes locais, tema salvo) para não falhar de novo.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-page text-strong antialiased">
        <Suspense fallback={null}>
          <Body error={error} reset={reset} />
        </Suspense>
      </body>
    </html>
  );
}
