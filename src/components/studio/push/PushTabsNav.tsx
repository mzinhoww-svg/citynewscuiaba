"use client";

import { usePathname } from "next/navigation";
import { PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import { cx } from "../../cx";
import { currentNavHref, NavLink } from "../../ui/NavLink";

export type PushTabKey = "new" | "queue" | "history" | "settings";

export const PUSH_TABS: readonly { key: PushTabKey; path: string; exact?: boolean }[] = [
  { key: "new", path: "", exact: true },
  { key: "queue", path: "/fila" },
  { key: "history", path: "/historico" },
  { key: "settings", path: "/configuracoes" },
];

export interface PushTabsNavProps {
  /** Abas que o papel pode ver, na ordem da spec. */
  tabs: readonly PushTabKey[];
  basePath?: string;
  className?: string;
}

/**
 * Abas de A09 como subrotas (D-P23): `nav aria-label` com a atual em `aria-current="page"`.
 * São links, não abas de JavaScript: cada uma tem URL e fronteira de erro própria.
 */
export function PushTabsNav({
  tabs,
  basePath = "/estudio/admin/notificacoes",
  className,
}: PushTabsNavProps) {
  const pathname = usePathname();
  const items = PUSH_TABS.filter((t) => tabs.includes(t.key)).map((t) => ({
    ...t,
    href: `${basePath}${t.path}`,
  }));
  const winner = currentNavHref(pathname, items);
  return (
    <nav
      aria-label={PUSH_ADMIN_TEXT.sectionNav}
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
              {PUSH_ADMIN_TEXT.tabs[it.key]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
