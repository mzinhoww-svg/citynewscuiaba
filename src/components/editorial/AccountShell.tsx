import Link from "next/link";
import type { ReactNode } from "react";
import { ACCOUNT_TEXT } from "@/content/pt-BR/account";

export interface AccountShellProps {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  /** Para onde "Continuar sem login" leva (padrão: início). `null` esconde o link. */
  skipHref?: string | null;
  /** Rodapé extra (ex.: "Ainda não tem conta? Criar conta"). */
  footer?: ReactNode;
}

/**
 * Moldura das telas de conta (C02 a C06): coluna estreita centrada, título, texto de apoio e,
 * sempre, a saída "Continuar sem login" (login nunca é obrigatório, CLAUDE.md §5 regra 2).
 *
 * ```tsx
 * <AccountShell title="Entrar na conta" intro="…" footer={<p>…</p>}>{form}</AccountShell>
 * ```
 */
export function AccountShell({
  title,
  intro,
  children,
  skipHref = "/",
  footer,
}: AccountShellProps) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-8 px-gutter py-8 lg:py-12">
      <header className="flex flex-col gap-2">
        <h1 className="type-screen-title text-strong">{title}</h1>
        {intro && <div className="type-body text-meta">{intro}</div>}
      </header>
      {children}
      <footer className="flex flex-col gap-3 border-t border-line-subtle pt-6 type-body text-meta">
        {footer}
        {skipHref !== null && (
          <p>
            <Link
              href={skipHref}
              className="font-semibold text-link underline underline-offset-4 hover:text-strong"
            >
              {ACCOUNT_TEXT.continueWithout}
            </Link>
          </p>
        )}
        <p className="type-meta">{ACCOUNT_TEXT.optionalNote}</p>
      </footer>
    </div>
  );
}
