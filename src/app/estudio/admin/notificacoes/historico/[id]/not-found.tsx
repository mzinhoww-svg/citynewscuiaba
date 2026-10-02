import { Button, EmptyState } from "@/components";
import { PUSH_HISTORY_TEXT as T } from "@/content/pt-BR/notifications-admin";

export default function NotFound() {
  return (
    <EmptyState
      tone="error"
      title={T.detail.notFound}
      actions={
        <Button href="/estudio/admin/notificacoes/historico" size="md" variant="outline">
          {T.detail.back}
        </Button>
      }
    >
      {T.detail.notFoundText}
    </EmptyState>
  );
}
