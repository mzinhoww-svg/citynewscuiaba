"use client";

import { ErrorState } from "@/components";

/** Fronteira de erro (P25, 500): mensagem simples, código e "Tentar de novo". */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState digest={error.digest} reset={reset} />;
}
