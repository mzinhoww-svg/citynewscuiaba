"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export interface NavLinkProps {
  href: string;
  /** Força o estado atual; sem ele, compara `href` com a rota. */
  current?: boolean;
  /** Só a rota exata conta como atual (sem subpáginas). */
  exact?: boolean;
  className?: string;
  children: ReactNode;
}

/** `true` quando a rota está em `href` (a raiz só casa com ela mesma). */
export function isCurrentPath(pathname: string | null, href: string, exact = false): boolean {
  if (!pathname) return false;
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Link de navegação que marca `aria-current="page"` na rota atual. O estilo ativo vem de
 * `aria-[current=page]:` nas classes de quem usa, então não depende só de cor.
 */
export function NavLink({ href, current, exact, className, children }: NavLinkProps) {
  const pathname = usePathname();
  const isCurrent = current ?? isCurrentPath(pathname, href, exact);
  return (
    <Link href={href} aria-current={isCurrent ? "page" : undefined} className={className}>
      {children}
    </Link>
  );
}
