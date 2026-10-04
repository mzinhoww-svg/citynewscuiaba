"use client";

import { usePathname } from "next/navigation";
import { ADS_ADMIN_TEXT } from "@/content/pt-BR/ads-admin";
import { cx } from "../../cx";
import { currentNavHref, NavLink } from "../../ui/NavLink";

const TABS = [
  { key: "occupancy", path: "", exact: true },
  { key: "banners", path: "/banners" },
  { key: "report", path: "/relatorio" },
  { key: "sponsored", path: "/patrocinados" },
] as const;

/**
 * Abas de A07 · Publicidade como subrotas (ADS-T4), no mesmo molde das de Notificações: links com
 * a atual em `aria-current="page"`, cada uma com URL própria.
 */
export function AdsTabsNav({
  basePath = "/estudio/admin/publicidade",
  className,
}: {
  basePath?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const items = TABS.map((t) => ({ ...t, href: `${basePath}${t.path}` }));
  const winner = currentNavHref(pathname, items);
  return (
    <nav
      aria-label={ADS_ADMIN_TEXT.tabs.label}
      className={cx("-mx-gutter overflow-x-auto px-gutter", className)}
    >
      <ul className="flex min-w-max gap-1 border-b border-line-section">
        {items.map((it) => (
          <li key={it.key}>
            <NavLink
              href={it.href}
              current={it.href === winner}
              className={cx(
                "flex min-h-tap items-center border-b-2 border-transparent px-3 text-16 text-meta no-underline hover:text-strong",
                "aria-[current=page]:border-line-strong aria-[current=page]:font-semibold aria-[current=page]:text-strong",
              )}
            >
              {ADS_ADMIN_TEXT.tabs[it.key]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
