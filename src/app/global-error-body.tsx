"use client";

import Link from "next/link";
import { SYSTEM } from "@/content/pt-BR/system";

/** Conteúdo do erro no layout raiz; carregado sob demanda por `global-error.tsx` (B-018). */
export default function GlobalErrorBody({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <title>{SYSTEM.errorTitle}</title>
      <main className="mx-auto flex max-w-page flex-col items-start gap-4 px-gutter py-16">
        <h1 className="type-screen-title text-strong">{SYSTEM.errorTitle}</h1>
        <p className="max-w-read type-body text-body">{SYSTEM.errorText}</p>
        {error.digest && <p className="type-meta text-meta">{SYSTEM.errorCode(error.digest)}</p>}
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex min-h-tap cursor-pointer items-center rounded-pill bg-tinta px-6 font-semibold text-branco"
          >
            {SYSTEM.retry}
          </button>
          <Link
            href="/"
            className="inline-flex min-h-tap items-center rounded-pill border border-line-control px-6 font-semibold text-strong no-underline"
          >
            {SYSTEM.backHome}
          </Link>
        </div>
      </main>
    </>
  );
}
