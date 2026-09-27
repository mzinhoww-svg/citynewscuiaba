import Link from "next/link";
import type { ReactNode } from "react";
import { NAV_TEXT } from "@/content/pt-BR/nav";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { Logo } from "../editorial/Logo";
import { Icon, type IconName } from "../ui/Icon";
import { NavLink } from "../ui/NavLink";

export interface StudioNavItem {
  href: string;
  label: string;
  icon: IconName;
  /** Marca como atual só na rota exata (a entrada do Estúdio). */
  exact?: boolean;
}

export interface StudioNavGroup {
  label: string;
  items: StudioNavItem[];
}

export interface StudioUser {
  name: string;
  /** Papéis já traduzidos ("Editor-chefe · Revisor"). */
  role: string;
}

export interface StudioShellProps {
  /** Grupos já filtrados pelo papel (Redação, Control Center, Governança). */
  nav: StudioNavGroup[];
  user: StudioUser;
  children: ReactNode;
  className?: string;
}

/**
 * Casca do Estúdio: cabeçalho com a assinatura e a conta, navegação lateral por grupo e área
 * de trabalho. A navegação chega filtrada pelo papel; o componente não conhece o banco.
 */
export function StudioShell({ nav, user, children, className }: StudioShellProps) {
  return (
    <div className={cx("min-h-dvh bg-section", className)}>
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-tooltip focus:rounded-sm focus:bg-page focus:px-4 focus:py-3"
      >
        {NAV_TEXT.skipToContent}
      </a>
      <header className="sticky top-0 z-sticky flex items-center gap-4 border-b border-line-subtle bg-page px-gutter py-1">
        <Link href="/estudio" className="flex items-center gap-2 rounded-xs no-underline">
          <Logo variant="symbol" size="sm" decorative />
          <span className="type-nav-title text-strong">{STUDIO_TEXT.name}</span>
        </Link>
        <p className="ml-auto flex flex-col items-end text-right type-meta text-meta">
          <span className="sr-only">{STUDIO_TEXT.signedInAs}</span>
          <span className="font-semibold text-strong">{user.name}</span>
          <span>{user.role}</span>
        </p>
      </header>
      <div className="lg:grid lg:grid-cols-[var(--spacing-rail)_minmax(0,1fr)]">
        <nav
          aria-label={STUDIO_TEXT.nav}
          className="border-b border-line-subtle bg-page px-3 py-4 lg:border-r lg:border-b-0"
        >
          {nav.map((group) => (
            <div key={group.label} className="mb-4 last:mb-0">
              <p className="px-3 pb-1 type-eyebrow text-meta">{group.label}</p>
              <ul>
                {group.items.map((it) => (
                  <li key={it.href}>
                    <NavLink
                      href={it.href}
                      exact={it.exact}
                      className={cx(
                        "flex min-h-tap items-center gap-3 rounded-sm px-3 text-16 text-strong no-underline hover:bg-section",
                        "aria-[current=page]:bg-section aria-[current=page]:font-semibold",
                      )}
                    >
                      <Icon name={it.icon} size={20} />
                      {it.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Link
            href="/"
            className="mt-4 flex min-h-tap items-center gap-3 px-3 text-14 font-medium text-link underline-offset-4 hover:underline"
          >
            <Icon name="external-link" size={16} />
            {STUDIO_TEXT.backToSite}
          </Link>
        </nav>
        <main id="conteudo" className="min-w-0 px-gutter py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
