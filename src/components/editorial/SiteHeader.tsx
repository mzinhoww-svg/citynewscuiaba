import Link from "next/link";
import type { CSSProperties } from "react";
import { MAIN_NAV, NAV_TEXT, SECTIONS, type NavItem } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { NavLink } from "../ui/NavLink";
import { LiveIndicator } from "./LiveIndicator";
import { Logo } from "./Logo";

export interface SiteHeaderProps {
  /** Barra superior (desktop). */
  items?: readonly NavItem[];
  /** Segunda linha: editorias. */
  sections?: readonly NavItem[];
  /** `id` do item atual; sem ele, o item vem da rota. */
  active?: string;
  /** Mostra "● AGORA". */
  live?: boolean;
  className?: string;
  style?: CSSProperties;
}

const current = (active: string | undefined, id: string) =>
  active === undefined ? undefined : active === id;

/**
 * Cabeçalho de todas as páginas do portal: assinatura horizontal, navegação principal
 * (Início, Explorar, Fontes, Favoritos, Agenda, Busca, Perfil), "● AGORA" e a linha de
 * editorias. Fixo no topo.
 *
 * ```tsx
 * <SiteHeader />                 // item ativo pela rota
 * <SiteHeader active="agenda" />
 * ```
 * - No mobile a navegação principal fica na `BottomNav`; aqui ela some (display: none), para
 *   não haver dois landmarks "Principal" visíveis.
 */
export function SiteHeader({
  items = MAIN_NAV,
  sections = SECTIONS,
  active,
  live = true,
  className,
  style,
}: SiteHeaderProps) {
  return (
    <header
      data-sticky="public"
      className={cx("sticky top-0 z-sticky border-b border-line-subtle bg-page", className)}
      style={style}
    >
      <div className="mx-auto flex max-w-page items-center gap-6 px-gutter py-1 lg:gap-10">
        <Link href="/" aria-label={NAV_TEXT.homeLink} className="-ml-2.5 shrink-0 rounded-xs">
          <Logo size="sm" decorative className="lg:hidden" />
          <Logo size="md" decorative className="hidden lg:block" />
        </Link>
        <nav aria-label={NAV_TEXT.mainNav} className="hidden flex-1 justify-center lg:flex">
          <ul className="flex items-center gap-1">
            {items.map((it) => (
              <li key={it.id}>
                <NavLink
                  href={it.href}
                  current={current(active, it.id)}
                  className={cx(
                    "flex min-h-tap items-center px-3 text-16 font-medium text-strong no-underline",
                    "border-b-2 border-transparent hover:border-line-section",
                    "aria-[current=page]:border-accent aria-[current=page]:font-semibold",
                  )}
                >
                  {it.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {live && <LiveIndicator className="ml-auto lg:ml-0" />}
      </div>
      <nav aria-label={NAV_TEXT.sectionsNav} className="border-t border-line-subtle">
        <ul className="mx-auto flex max-w-page snap-x gap-1 overflow-x-auto px-gutter scrollbar-none lg:justify-center">
          {sections.map((it) => (
            <li key={it.id} className="snap-start">
              <NavLink
                href={it.href}
                current={current(active, it.id)}
                className={cx(
                  "flex min-h-tap items-center whitespace-nowrap px-3 text-14 font-medium text-meta no-underline",
                  "hover:text-strong aria-[current=page]:font-semibold aria-[current=page]:text-strong",
                  "aria-[current=page]:underline aria-[current=page]:decoration-accent aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-8",
                )}
              >
                {it.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
