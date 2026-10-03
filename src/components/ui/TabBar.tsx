import { NAV_TEXT, TAB_NAV } from "@/content/pt-BR/nav";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";
import { NavLink } from "./NavLink";

export interface TabBarItem {
  id: string;
  label: string;
  href: string;
  icon: IconName;
  /** Preenche o ícone no estado ativo (Favoritos). */
  fillActive?: boolean;
}

const ICON_BY_ID: Record<string, IconName> = {
  home: "house",
  explore: "compass",
  search: "search",
  favorites: "bookmark",
  profile: "user",
};

/** Os 5 destinos do app (R10): Início, Explorar, Busca, Favoritos, Perfil. */
export const DEFAULT_TABS: TabBarItem[] = TAB_NAV.map((item) => ({
  ...item,
  icon: ICON_BY_ID[item.id] ?? "house",
  fillActive: item.id === "favorites",
}));

export interface TabBarProps {
  items?: TabBarItem[];
  /** `id` do destino atual; sem ele, o destino vem da rota. */
  active?: string;
  /** Nome do landmark. */
  label?: string;
  className?: string;
}

/**
 * Navegação inferior do app, 64 px + área segura (a borda entra nos 64, para o banner de consentimento encostar sem sobrepor); destino ativo em Urucum Texto com
 * indicador Urucum no topo e `aria-current="page"`.
 *
 * ```tsx
 * <TabBar active="home" />
 * ```
 * - Cinco destinos (DESIGN.md R10). Cada destino é um link real, não um botão.
 */
export function TabBar({
  items = DEFAULT_TABS,
  active,
  label = NAV_TEXT.mainNav,
  className,
}: TabBarProps) {
  return (
    <nav
      aria-label={label}
      className={cx("h-tabbar-safe border-t border-line-subtle bg-card-white pb-safe", className)}
    >
      <ul className="flex h-full">
        {items.map((it) => (
          <li key={it.id} className="flex flex-1">
            <NavLink
              href={it.href}
              current={active === undefined ? undefined : it.id === active}
              className={cx(
                "group relative flex flex-1 flex-col items-center justify-center gap-1.5",
                "text-13 font-medium leading-none text-placeholder no-underline",
                "aria-[current=page]:font-semibold aria-[current=page]:text-link",
                "before:absolute before:top-0 before:hidden before:h-0.75 before:w-6 before:rounded-b-xs before:bg-accent",
                "aria-[current=page]:before:block",
              )}
            >
              <Icon
                name={it.icon}
                size={24}
                className={it.fillActive ? "group-aria-[current=page]:fill-current" : undefined}
              />
              {it.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
