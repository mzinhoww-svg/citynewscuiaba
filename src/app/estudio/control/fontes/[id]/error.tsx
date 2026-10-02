"use client";

import { useRouter } from "next/navigation";
import { startTransition } from "react";
import { Button, EmptyState } from "@/components";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";

/** Fronteira de erro por seção: o cabeçalho e as outras seções (layout) continuam disponíveis. */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  return (
    <EmptyState
      tone="error"
      title={DETAIL_TEXT.error.tab}
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
          {DETAIL_TEXT.error.retry}
        </Button>
      }
    />
  );
}
