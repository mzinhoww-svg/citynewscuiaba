import Link from "next/link";
import { FOOTER_NAV, LEGAL, NAV_TEXT } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { Logo } from "./Logo";

export interface SiteFooterProps {
  className?: string;
}

/**
 * Rodapé do portal: placa Tinta com a assinatura negativa, páginas institucionais e dados da
 * empresa. Razão social, CNPJ e encarregado LGPD ficam como `[PREENCHER]` até o dono informar
 * (B-001).
 */
export function SiteFooter({ className }: SiteFooterProps) {
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
        <div className="flex flex-col gap-1 border-t border-branco/20 pt-6 type-meta text-branco/85">
          <p>{LEGAL.companyName}</p>
          <p>{LEGAL.cnpj}</p>
          <p>{LEGAL.dpo}</p>
          <p className="mt-2">{LEGAL.copyright}</p>
        </div>
      </div>
    </footer>
  );
}
