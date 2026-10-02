"use client";

import { lazy, Suspense } from "react";
import { safeDefault } from "@/lib/lazy";
import "@/styles/globals.css";

// Textos e botões só carregam quando o erro acontece (B-018): fora do caminho feliz, o
// `global-error` não pesa no JS inicial. Sem rede o conteúdo não chega: `safeDefault` deixa só
// o documento vazio, que é o que dá para mostrar sem o chunk.
type BodyProps = { error: Error & { digest?: string }; reset: () => void };
const Body = lazy(() =>
  safeDefault<BodyProps>(() => import("./global-error-body").then((m) => m.default)),
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
