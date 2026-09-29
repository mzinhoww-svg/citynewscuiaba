"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SECTION_NAV } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";

export interface SourceSectionNavProps {
  /** Endereço base da fonte (`/estudio/control/fontes/<id>`). */
  basePath: string;
  className?: string;
}

/** Seção atual pelo endereço: a raiz só vale na raiz; as demais valem por prefixo. */
export function currentSection(basePath: string, pathname: string): string {
  const rest = pathname.startsWith(basePath) ? pathname.slice(basePath.length) : "";
  const clean = rest.replace(/\/+$/, "");
  return SECTION_NAV.items.find((i) => i.path !== "" && clean.startsWith(i.path))?.key ?? "resumo";
}

/**
 * Navegação entre as seções da fonte (subrotas): links, não abas de script, para o estado ficar no
 * endereço. A seção atual leva `aria-current="page"`; a lista rola na horizontal em 360 px.
 */
export function SourceSectionNav({ basePath, className }: SourceSectionNavProps) {
  const pathname = usePathname() ?? basePath;
  const current = currentSection(basePath, pathname);
  return (
    <nav aria-label={SECTION_NAV.label} className={cx("border-b border-line-subtle", className)}>
      <ul className="-mb-px flex gap-1 overflow-x-auto">
        {SECTION_NAV.items.map((it) => {
          const active = it.key === current;
          return (
            <li key={it.key} className="shrink-0">
              <Link
                href={`${basePath}${it.path}`}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "flex min-h-tap items-center border-b-2 px-3 text-14 no-underline",
                  active
                    ? "border-line-strong font-semibold text-strong"
                    : "border-transparent font-medium text-meta hover:text-strong",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
