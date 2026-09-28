"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Button, EmptyState } from "@/components";
import { STUDIO_TEXT as T } from "@/content/pt-BR/studio";

/**
 * Fronteira de erro do Estúdio (achado 17 do gate P4): falha de banco numa tela da redação
 * fica dentro do shell (navegação lateral continua), com "Tentar de novo" e volta à redação.
 * Nunca mostra a mensagem técnica, só o código.
 */
export default function StudioError({
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
      title={T.errorTitle}
      actions={
        <>
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
            {T.retry}
          </Button>
          <Link href="/estudio" className="type-body font-medium text-link underline">
            {T.backToNewsroom}
          </Link>
        </>
      }
    >
      <p>{T.errorText}</p>
      {error.digest && <p className="type-meta text-meta">{T.errorCode(error.digest)}</p>}
    </EmptyState>
  );
}
