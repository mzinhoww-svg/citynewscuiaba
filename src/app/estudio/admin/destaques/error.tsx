"use client";

import { ErrorState } from "@/components";

/** Fronteira de erro dos destaques (docs/screens.md, estado erro): "Tentar de novo". */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorState digest={error.digest} reset={reset} />;
}
