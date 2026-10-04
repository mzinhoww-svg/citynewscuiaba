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
  onClick?: () => void;
  children: ReactNode;
}

/** `true` quando a rota está em `href` (a raiz só casa com ela mesma). */
export function isCurrentPath(pathname: string | null, href: string, exact = false): boolean {
  if (!pathname) return false;
  if (exact || href === "/") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Entre vários itens de navegação cujo `href` pode ser prefixo um do outro (ex.: "/estudio/control"
 * e "/estudio/control/fontes"), devolve o `href` mais específico (mais longo) que casa com a rota
 * atual — só ele fica "atual". Evita dois itens acesos ao mesmo tempo (Visão geral + Fontes).
 *
 * ```ts
 * currentNavHref("/estudio/control/fontes", [
 *   { href: "/estudio/control" },
 *   { href: "/estudio/control/fontes" },
 * ]); // "/estudio/control/fontes"
 * ```
 */
export function currentNavHref(
  pathname: string | null,
  items: readonly { href: string; exact?: boolean }[],
): string | null {
  let best: string | null = null;
  for (const it of items) {
    if (!isCurrentPath(pathname, it.href, it.exact)) continue;
    if (best === null || it.href.length > best.length) best = it.href;
  }
  return best;
}

/**
 * Link de navegação que marca `aria-current="page"` na rota atual. O estilo ativo vem de
 * `aria-[current=page]:` nas classes de quem usa, então não depende só de cor.
 */
export function NavLink({ href, current, exact, className, onClick, children }: NavLinkProps) {
  const pathname = usePathname();
  const isCurrent = current ?? isCurrentPath(pathname, href, exact);
  return (
    <Link
      href={href}
      aria-current={isCurrent ? "page" : undefined}
      className={className}
      onClick={onClick}
    >
      {children}
    </Link>
  );
}
