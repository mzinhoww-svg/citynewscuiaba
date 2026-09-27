import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "./Icon";
import { IconButton } from "./IconButton";

export interface NavHeaderProps {
  title?: ReactNode;
  /** Destino de voltar (link). Prefira a `onBack` sempre que houver URL. */
  backHref?: string;
  onBack?: () => void;
  right?: ReactNode;
  /** circle = botão de 48 com borda (feed, matéria); plain = seta simples (pilha de configurações) */
  variant?: "circle" | "plain";
  divider?: boolean;
  /** Nível do título; padrão sem heading (o h1 fica no conteúdo). */
  as?: "h1" | "h2" | "div";
  className?: string;
  style?: CSSProperties;
}

/**
 * Barra superior de telas empilhadas (Buscar, Estatísticas, Idioma, Configurações): voltar à
 * esquerda, título centralizado, ação opcional à direita.
 *
 * ```tsx
 * <NavHeader title="Buscar" backHref="/" />
 * <NavHeader title="Idioma" variant="plain" divider backHref="/perfil" right={<IconButton icon="ellipsis-vertical" label="Mais opções" variant="ghost" />} />
 * ```
 */
export function NavHeader({
  title,
  backHref,
  onBack,
  right,
  variant = "circle",
  divider = false,
  as: Title = "div",
  className,
  style,
}: NavHeaderProps) {
  const hasBack = backHref !== undefined || onBack !== undefined;
  const plainClass =
    "flex size-icon-btn cursor-pointer items-center justify-center rounded-pill text-strong hover:bg-section";
  const back = !hasBack ? null : variant === "circle" ? (
    <IconButton icon="arrow-left" label={UI.back} href={backHref} onClick={onBack} />
  ) : backHref ? (
    <Link href={backHref} aria-label={UI.back} className={plainClass}>
      <Icon name="arrow-left" />
    </Link>
  ) : (
    <button type="button" aria-label={UI.back} onClick={onBack} className={plainClass}>
      <Icon name="arrow-left" />
    </button>
  );
  return (
    <div
      className={cx(
        "grid min-h-icon-btn grid-cols-[var(--spacing-icon-btn)_1fr_var(--spacing-icon-btn)] items-center",
        divider && "border-b border-line-subtle pb-4",
        className,
      )}
      style={style}
    >
      <div className="flex">{back}</div>
      <Title className="text-center type-nav-title text-strong">{title}</Title>
      <div className="flex justify-end">{right}</div>
    </div>
  );
}
