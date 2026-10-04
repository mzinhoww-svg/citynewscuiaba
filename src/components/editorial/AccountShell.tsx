import Link from "next/link";
import type { ReactNode } from "react";
import { ACCOUNT_TEXT } from "@/content/pt-BR/account";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

export interface AccountShellProps {
  title: string;
  intro?: ReactNode;
  children: ReactNode;
  /** Para onde "Continuar sem login" leva (padrão: início). `null` esconde o link. */
  skipHref?: string | null;
  /** Rodapé extra (ex.: "Ainda não tem conta? Criar conta"). */
  footer?: ReactNode;
  /**
   * Login e cadastro (UI-T12): mostra os 3 benefícios da conta (ao lado no desktop, numa linha
   * acima do formulário no celular) e a saída "Continuar sem entrar" em botão de contorno.
   */
  benefits?: boolean;
}

function Benefits() {
  return (
    <aside className="lg:col-start-1 lg:row-span-3 lg:row-start-1 lg:flex lg:flex-col lg:justify-center lg:rounded-lg lg:bg-inverse lg:p-10">
      <ul
        aria-label={ACCOUNT_TEXT.benefitsLabel}
        className="flex flex-wrap gap-x-4 gap-y-1 type-meta text-meta lg:flex-col lg:gap-5 lg:type-body lg:text-on-inverse"
      >
        {ACCOUNT_TEXT.benefits.map((b) => (
          <li key={b} className="flex items-center gap-1.5 lg:gap-3">
            <Icon name="check" size={16} className="shrink-0 text-service lg:text-on-inverse" />
            {b}
          </li>
        ))}
      </ul>
    </aside>
  );
}

/**
 * Moldura das telas de conta (C02 a C06): coluna estreita centrada, título, texto de apoio e,
 * sempre, a saída sem login (login nunca é obrigatório, CLAUDE.md §5 regra 2). Com `benefits`
 * (login e cadastro), vira duas colunas no desktop, com os benefícios à esquerda, e a saída
 * passa a ser o botão de contorno "Continuar sem entrar".
 *
 * ```tsx
 * <AccountShell title="Entrar na conta" intro="…" benefits footer={<p>…</p>}>{form}</AccountShell>
 * ```
 */
export function AccountShell({
  title,
  intro,
  children,
  skipHref = "/",
  footer,
  benefits = false,
}: AccountShellProps) {
  const col = benefits ? "lg:col-start-2" : undefined;
  return (
    <div
      className={cx(
        "mx-auto w-full px-gutter py-8 lg:py-12",
        benefits
          ? "grid max-w-md grid-cols-1 gap-8 lg:max-w-5xl lg:grid-cols-2 lg:gap-x-16"
          : "flex max-w-md flex-col gap-8",
      )}
    >
      <header className={cx("flex flex-col gap-2", col, benefits && "lg:row-start-1")}>
        <h1 className="type-screen-title text-strong">{title}</h1>
        {intro && <div className="type-body text-meta">{intro}</div>}
      </header>
      {benefits && <Benefits />}
      {benefits ? (
        <div className="flex flex-col gap-8 lg:col-start-2 lg:row-start-2">{children}</div>
      ) : (
        children
      )}
      <footer
        className={cx(
          "flex flex-col gap-3 border-t border-line-subtle pt-6 type-body text-meta",
          col,
          benefits && "lg:row-start-3",
        )}
      >
        {footer}
        {skipHref !== null &&
          (benefits ? (
            <Button href={skipHref} variant="outline" size="md" fullWidth>
              {ACCOUNT_TEXT.continueWithoutSignIn}
            </Button>
          ) : (
            <p>
              <Link
                href={skipHref}
                className="font-semibold text-link underline underline-offset-4 hover:text-strong"
              >
                {ACCOUNT_TEXT.continueWithout}
              </Link>
            </p>
          ))}
        <p className="type-meta">{ACCOUNT_TEXT.optionalNote}</p>
      </footer>
    </div>
  );
}
