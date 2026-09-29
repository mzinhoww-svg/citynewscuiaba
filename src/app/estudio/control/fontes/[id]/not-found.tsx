import { Button, EmptyState } from "@/components";
import { DETAIL } from "@/content/pt-BR/sources-admin-detail";

export default function SourceNotFound() {
  return (
    <EmptyState
      as="h1"
      icon="search"
      title={DETAIL.notFoundTitle}
      actions={
        <Button size="md" href="/estudio/control/fontes">
          {DETAIL.backToList}
        </Button>
      }
    >
      {DETAIL.notFoundBody}
    </EmptyState>
  );
}
