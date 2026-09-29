"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Button, EmptyState } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";

/** Erro de uma seção da fonte: o cabeçalho e as outras seções continuam disponíveis. */
export default function SourceSectionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <EmptyState
      tone="error"
      title={DETAIL.errorTitle}
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
          {DETAIL.retry}
        </Button>
      }
    >
      {DETAIL.sectionError}
      {error.digest && (
        <span className="mt-2 block type-meta text-meta">Código: {error.digest}</span>
      )}
    </EmptyState>
  );
}
