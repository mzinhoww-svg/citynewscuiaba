"use client";

import { ErrorState } from "@/components";

/** Fronteira de erro das Configurações (docs/screens.md, estado erro). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState digest={error.digest} reset={reset} />;
}
