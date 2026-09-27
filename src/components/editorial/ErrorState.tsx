"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { SYSTEM } from "@/content/pt-BR/system";
import { Button } from "../ui/Button";
import { SystemState } from "./SystemState";

export interface ErrorStateProps {
  /** Código do erro do Next (`error.digest`), para o leitor informar ao suporte. */
  digest?: string;
  /** `reset` da fronteira de erro. */
  reset: () => void;
}

/**
 * Erro 500 (P25): mensagem em linguagem simples, "Tentar de novo" (refaz a leitura no
 * servidor) e volta ao início. Nunca mostra detalhes técnicos além do código.
 *
 * ```tsx
 * <ErrorState digest={error.digest} reset={reset} />
 * ```
 */
export function ErrorState({ digest, reset }: ErrorStateProps) {
  const router = useRouter();
  return (
    <SystemState
      title={SYSTEM.errorTitle}
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
            {SYSTEM.retry}
          </Button>
          <Button href="/" size="md" variant="outline">
            {SYSTEM.backHome}
          </Button>
        </>
      }
    >
      <p>{SYSTEM.errorText}</p>
      {digest && <p className="type-meta text-meta">{SYSTEM.errorCode(digest)}</p>}
    </SystemState>
  );
}
