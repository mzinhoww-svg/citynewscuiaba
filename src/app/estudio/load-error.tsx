import Link from "next/link";
import { EmptyState } from "@/components";
import { STUDIO_TEXT as T } from "@/content/pt-BR/studio";

/**
 * Estado de erro das telas de detalhe do Estúdio quando a leitura falha (achado 17): explica
 * em linguagem simples e oferece recarregar a mesma tela ou voltar à redação.
 */
export function LoadError({ retryHref }: { retryHref: string }) {
  return (
    <EmptyState
      as="h1"
      tone="error"
      title={T.errorTitle}
      actions={
        <>
          <Link href={retryHref} className="type-body font-medium text-link underline">
            {T.retry}
          </Link>
          <Link href="/estudio" className="type-body font-medium text-link underline">
            {T.backToNewsroom}
          </Link>
        </>
      }
    >
      <p>{T.errorText}</p>
    </EmptyState>
  );
}

/** Lê os dados da tela; falha vira `null` + log (a página mostra `LoadError`). */
export async function loadOrNull<T>(
  what: string,
  load: () => Promise<T>,
): Promise<{ value: T } | null> {
  try {
    return { value: await load() };
  } catch (e) {
    console.error(`estudio ${what}:`, e instanceof Error ? e.message : e);
    return null;
  }
}
