import type { ReactNode } from "react";
import { Button, EmptyState } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";

/**
 * Moldura das telas da Administração (A01–A14): rótulo da seção, título, introdução e, quando a
 * leitura falha, o estado de erro com "Tentar de novo" (docs/screens.md, estados padrão).
 */
export function AdminScreen({
  title,
  intro,
  retryHref,
  failed,
  children,
  aside,
}: {
  title: string;
  intro: string;
  retryHref: string;
  failed: boolean;
  children: ReactNode;
  /** Ação principal à direita do cabeçalho. */
  aside?: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="flex flex-col gap-2">
          <p className="type-eyebrow">{T.sectionLabel}</p>
          <h1 className="type-screen-title text-strong">{title}</h1>
          <p className="max-w-read type-body text-meta">{intro}</p>
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </header>
      {failed ? (
        <EmptyState
          tone="error"
          icon="circle-alert"
          title={T.errorTitle}
          actions={
            <Button href={retryHref} size="md" variant="outline">
              {T.retry}
            </Button>
          }
        >
          {T.errorBody}
        </EmptyState>
      ) : (
        children
      )}
    </section>
  );
}
