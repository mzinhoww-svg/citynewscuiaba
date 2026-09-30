"use client";

import { lazy, Suspense } from "react";
import "@/styles/globals.css";

// Textos e botões só carregam quando o erro acontece (B-018): fora do caminho feliz, o
// `global-error` não pesa no JS inicial.
const Body = lazy(() => import("./global-error-body"));

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
