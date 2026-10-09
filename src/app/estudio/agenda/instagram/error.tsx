"use client";

import { ErrorState } from "@/components";

/** Fronteira de erro do pacote do Instagram (ARD-T6): estado erro com nova tentativa. */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState digest={error.digest} reset={reset} />;
}
