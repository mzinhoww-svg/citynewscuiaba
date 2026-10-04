"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { STUDIO_TEXT } from "@/content/pt-BR/studio";
import { cx } from "../cx";
import { currentNavHref, NavLink } from "../ui/NavLink";
import { Icon } from "../ui/Icon";
import type { StudioNavGroup } from "./StudioShell";

export interface StudioNavProps {
  nav: StudioNavGroup[];
  /**
   * Itens de onde sai o item atual. Na gaveta com busca, `nav` vem filtrada e o atual continua
   * sendo decidido sobre a navegação inteira. Padrão: `nav`.
   */
  allNav?: StudioNavGroup[];
  /** Chamado ao escolher um item (a gaveta do celular fecha). */
  onNavigate?: () => void;
  /** Link "Ver o portal" no fim da lista (a gaveta mostra o seu no rodapé). */
  backLink?: boolean;
  className?: string;
}

/**
 * Navegação do Estúdio (trilho lateral no desktop e corpo da gaveta no celular). Decide o item
 * atual uma única vez: quando um item é prefixo de outro (`/estudio/control` e
 * `/estudio/control/fontes`), só o mais específico fica `aria-current="page"` (achado da revisão
 * FS-T7: os dois acendiam juntos).
 */
export function StudioNav({
  nav,
  allNav = nav,
  onNavigate,
  backLink = true,
  className,
}: StudioNavProps) {
  const pathname = usePathname();
  const winner = currentNavHref(
    pathname,
    allNav.flatMap((g) => g.items),
  );

  return (
    <nav aria-label={STUDIO_TEXT.nav} className={cx("bg-page px-3 py-4", className)}>
      {nav.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p className="px-3 pb-1 type-eyebrow text-meta">{group.label}</p>
          <ul>
            {group.items.map((it) => (
              <li key={it.href}>
                <NavLink
                  href={it.href}
                  current={it.href === winner}
                  onClick={onNavigate}
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
      {backLink && (
        <Link
          href="/"
          className="mt-4 flex min-h-tap items-center gap-3 px-3 text-14 font-medium text-link underline-offset-4 hover:underline"
        >
          <Icon name="external-link" size={16} />
          {STUDIO_TEXT.backToSite}
        </Link>
      )}
    </nav>
  );
}
