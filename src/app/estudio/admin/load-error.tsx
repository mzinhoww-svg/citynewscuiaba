import { Button, EmptyState } from "@/components";
import { ADMIN_TEXT as T } from "@/content/pt-BR/admin";

/** Estado de erro das telas de Administração (banco fora): nada foi alterado, tentar de novo. */
export function AdminLoadError({ href }: { href: string }) {
  return (
    <EmptyState
      tone="error"
      icon="circle-alert"
      title={T.errorTitle}
      actions={
        <Button href={href} size="md" variant="outline">
          {T.retry}
        </Button>
      }
    >
      {T.errorBody}
    </EmptyState>
  );
}
