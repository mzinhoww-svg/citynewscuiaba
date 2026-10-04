import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface TagLinkProps {
  href: string;
  children: ReactNode;
  /** Página atual: `aria-current="page"`, Tinta com texto branco e peso maior. */
  active?: boolean;
  /** Ícone decorativo à esquerda (16 px). */
  icon?: IconName;
  className?: string;
}

/**
 * Pílula de link (item 33, D-09): tema, editoria, bairro ou atalho que leva a outra página.
 * Sempre `<a href>` (funciona sem JavaScript); para filtro que alterna estado na mesma tela,
 * use `Chip`.
 *
 * ```tsx
 * <TagLink href="/tema/chuva">Chuva</TagLink>
 * <TagLink href="/editoria/cidade" active>Cidade</TagLink>
 * <TagLink href="/agenda" icon="calendar">Agenda</TagLink>
 * ```
 * - Superfície Névoa (R1); ativo = Tinta com texto branco e `font-semibold` (não só cor).
 * - Alvo de toque de 44 px (`min-h-tap`).
 */
export function TagLink({ href, children, active = false, icon, className }: TagLinkProps) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "inline-flex min-h-tap shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-14 leading-none no-underline",
        "transition-colors duration-(--dur-base) ease-(--ease-standard)",
        active
          ? "bg-action-primary font-semibold text-on-inverse"
          : "bg-section font-medium text-meta hover:bg-hover hover:text-strong",
        className,
      )}
    >
      {icon ? <Icon name={icon} size={16} /> : null}
      {children}
    </Link>
  );
}
