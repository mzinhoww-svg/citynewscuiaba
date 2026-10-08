"use client";

import { usePathname } from "next/navigation";
import { DETAIL_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { currentNavHref, NavLink } from "../../ui/NavLink";

export interface SourceSectionNavProps {
  /** `/estudio/control/fontes/<id>`. */
  basePath: string;
  /** Fonte de eventos (AGM-T6): sem Recomendação e Itens, com a aba Recusas. */
  kind?: "news" | "events";
  className?: string;
}

export const SOURCE_SECTIONS = [
  { key: "summary", path: "", exact: true },
  { key: "config", path: "/configuracao" },
  { key: "collection", path: "/coleta" },
  { key: "recommendation", path: "/recomendacao" },
  { key: "history", path: "/historico" },
  { key: "items", path: "/itens" },
] as const;

export const EVENT_SOURCE_SECTIONS = [
  { key: "summary", path: "", exact: true },
  { key: "config", path: "/configuracao" },
  { key: "collection", path: "/coleta" },
  { key: "rejections", path: "/recusas" },
  { key: "history", path: "/historico" },
] as const;

/**
 * Seções do detalhe da fonte (spec §8, O04): `nav aria-label="Seções da fonte"` com a seção atual
 * em `aria-current="page"`. São links (subrotas), não abas de JavaScript: cada seção tem URL e
 * fronteira de erro própria.
 */
export function SourceSectionNav({ basePath, kind = "news", className }: SourceSectionNavProps) {
  const pathname = usePathname();
  const sections = kind === "events" ? EVENT_SOURCE_SECTIONS : SOURCE_SECTIONS;
  const items = sections.map((s) => ({ ...s, href: `${basePath}${s.path}` }));
  const winner = currentNavHref(pathname, items);
  return (
    <nav
      aria-label={DETAIL_TEXT.sectionNav}
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
              {DETAIL_TEXT.sections[it.key]}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
