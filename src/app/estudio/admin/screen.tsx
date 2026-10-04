import type { ReactNode } from "react";
import { Button, EmptyState } from "@/components";
import { StudioScreen } from "@/components/estudio";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";

/**
 * Moldura das telas da Administração (A01–A14) sobre `StudioScreen` (item 57): rótulo da seção,
 * título, introdução e, quando a leitura falha, o estado de erro com "Tentar de novo"
 * (docs/screens.md, estados padrão).
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
    <StudioScreen
      section={T.sectionLabel}
      title={title}
      intro={intro}
      actions={aside}
      gap="lg"
      error={
        failed ? (
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
        ) : undefined
      }
    >
      {children}
    </StudioScreen>
  );
}
