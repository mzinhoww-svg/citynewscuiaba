import Link from "next/link";
import type { CSSProperties } from "react";
import { MAIN_NAV, NAV_TEXT, QUICK_NAV, SECTIONS, type NavItem } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";
import { NavLink } from "../ui/NavLink";
import { VisuallyHidden } from "../ui/VisuallyHidden";
import { LiveIndicator } from "./LiveIndicator";
import { Logo } from "./Logo";
import { SectionsNav, StickyHeader } from "./SiteHeaderParts";

export interface SiteHeaderProps {
  /** Destinos principais (desktop). */
  items?: readonly NavItem[];
  /** Atalhos em ícone (desktop): Busca, Favoritos, Perfil. */
  quick?: readonly NavItem[];
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

const QUICK_ICON: Record<string, IconName> = {
  search: "search",
  favorites: "heart",
  profile: "user",
};

/**
 * Cabeçalho de todas as páginas do portal: assinatura horizontal, 4 destinos (Início, Explorar,
 * Agenda, Fontes), atalhos de Busca, Favoritos e Perfil, "● AGORA" e a fileira de editorias.
 * Fixo no topo; ao rolar, a linha principal encolhe (`data-scrolled`) sem mover o conteúdo.
 *
 * ```tsx
 * <SiteHeader />                 // item ativo pela rota
 * <SiteHeader active="agenda" />
 * ```
 * - No mobile a navegação principal e os atalhos ficam na `BottomNav`; aqui somem (display:
 *   none), para não haver dois landmarks "Principal" visíveis.
 * - Os atalhos são ícones com nome acessível ("Busca", "Favoritos", "Perfil"), alcançáveis por
 *   teclado.
 */
export function SiteHeader({
  items = MAIN_NAV,
  quick = QUICK_NAV,
  sections = SECTIONS,
  active,
  live = true,
  className,
  style,
}: SiteHeaderProps) {
  return (
    <StickyHeader
      className={cx(
        "group/header sticky top-0 z-sticky border-b border-line-subtle bg-page",
        // Encolher a linha principal (3,5 rem para 2,75 rem) é compensado aqui: o bloco ocupa
        // a mesma altura no fluxo e o conteúdo não pula.
        "data-[scrolled=true]:mb-3",
        className,
      )}
      style={style}
    >
      <div className="mx-auto flex h-14 max-w-page items-center gap-6 px-gutter motion-safe:transition-[height] motion-safe:duration-(--dur-fast) group-data-[scrolled=true]/header:h-tap lg:gap-10">
        <Link
          href="/"
          aria-label={NAV_TEXT.homeLink}
          className="-ml-2.5 flex min-h-tap shrink-0 items-center rounded-xs px-2.5"
        >
          {/* Sem área de proteção vertical: o logo (h-10) cabe na linha principal (h-14, e h-tap
              ao rolar) e não invade a fileira de editorias. A folga lateral vem do `px-2.5`. */}
          <Logo size="sm" decorative clearSpace={false} className="lg:hidden" />
          <Logo size="md" decorative clearSpace={false} className="hidden lg:block" />
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
        <nav aria-label={NAV_TEXT.quickNav} className="hidden lg:flex">
          <ul className="flex items-center">
            {quick.map((it) => (
              <li key={it.id}>
                <NavLink
                  href={it.href}
                  current={current(active, it.id)}
                  className={cx(
                    "flex min-h-tap min-w-tap items-center justify-center rounded-sm text-strong no-underline",
                    "hover:bg-section aria-[current=page]:bg-section",
                  )}
                >
                  <Icon name={QUICK_ICON[it.id] ?? "search"} size={22} />
                  <VisuallyHidden>{it.label}</VisuallyHidden>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
        {live && <LiveIndicator className="ml-auto lg:ml-0" />}
      </div>
      <SectionsNav sections={sections} active={active} label={NAV_TEXT.sectionsNav} />
    </StickyHeader>
  );
}
