"use client";

import { ErrorState } from "@/components";

/** Fronteira de erro da Agenda do Estúdio (docs/screens.md, estado erro com nova tentativa). */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState digest={error.digest} reset={reset} />;
}
