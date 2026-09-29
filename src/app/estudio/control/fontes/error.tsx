"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Button, EmptyState } from "@/components";
import { SOURCES_LIST_TEXT as T } from "@/content/pt-BR/sources-admin-list";

/**
 * Falha ao ler a lista de fontes: fica dentro do Estúdio, sem mensagem técnica (só o código do
 * erro) e com "Tentar de novo" na mesma URL, então os filtros continuam.
 */
export default function SourcesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <EmptyState
      as="h1"
      tone="error"
      title={T.error.title}
      actions={
        <Button
          size="md"
          icon="refresh-cw"
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          {T.error.retry}
        </Button>
      }
    >
      {T.error.body}
      {error.digest && (
        <span className="mt-2 block type-meta text-meta">Código: {error.digest}</span>
      )}
    </EmptyState>
  );
}
