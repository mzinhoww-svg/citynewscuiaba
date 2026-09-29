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
  className?: string;
}

/**
 * Navegação lateral do Estúdio (extraída de `StudioShell` para decidir o item atual uma única
 * vez): quando um item é prefixo de outro (`/estudio/control` e `/estudio/control/fontes`), só o
 * mais específico fica `aria-current="page"` (achado da revisão FS-T7: os dois acendiam juntos).
 */
export function StudioNav({ nav, className }: StudioNavProps) {
  const pathname = usePathname();
  const winner = currentNavHref(
    pathname,
    nav.flatMap((g) => g.items),
  );

  return (
    <nav
      aria-label={STUDIO_TEXT.nav}
      className={cx(
        "border-b border-line-subtle bg-page px-3 py-4 lg:border-r lg:border-b-0",
        className,
      )}
    >
      {nav.map((group) => (
        <div key={group.label} className="mb-4 last:mb-0">
          <p className="px-3 pb-1 type-eyebrow text-meta">{group.label}</p>
          <ul>
            {group.items.map((it) => (
              <li key={it.href}>
                <NavLink
                  href={it.href}
                  current={it.href === winner}
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
  );
}
