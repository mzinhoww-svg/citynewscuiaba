import Link from "next/link";
import { FOOTER_NAV, LEGAL, NAV_TEXT } from "@/content/pt-BR/nav";
import { isFilled } from "@/content/pt-BR/institutional";
import { cx } from "../cx";
import { Logo } from "./Logo";

export interface SiteFooterProps {
  className?: string;
}

/**
 * Rodapé do portal: placa Tinta com a assinatura negativa, páginas institucionais e dados da
 * empresa. Razão social, CNPJ e encarregado LGPD só aparecem quando preenchidos (B-001); sem
 * nenhum, a seção e a linha divisória somem e sobra o copyright.
 */
export function SiteFooter({ className }: SiteFooterProps) {
  const company = [LEGAL.companyName, LEGAL.cnpj, LEGAL.dpo].filter(isFilled);
  return (
    <footer className={cx("bg-tinta text-branco", className)}>
      <div className="mx-auto flex max-w-page flex-col gap-8 px-gutter py-10">
        <div className="flex flex-col gap-3">
          <Logo tone="negative" size="md" className="-ml-3 self-start" />
          <p className="type-body text-branco/85">{LEGAL.tagline}</p>
        </div>
        <nav aria-label={NAV_TEXT.footerNav}>
          <ul className="grid grid-cols-2 gap-x-6 sm:grid-cols-3 lg:grid-cols-5">
            {FOOTER_NAV.map((it) => (
              <li key={it.id}>
                <Link
                  href={it.href}
                  className="flex min-h-tap items-center text-14 font-medium text-branco underline-offset-4 hover:underline"
                >
                  {it.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        {company.length > 0 && (
          <div
            data-company
            className="flex flex-col gap-1 border-t border-branco/20 pt-6 type-meta text-branco/85"
          >
            {company.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        )}
        <p className="type-meta text-branco/85">{LEGAL.copyright}</p>
      </div>
    </footer>
  );
}
