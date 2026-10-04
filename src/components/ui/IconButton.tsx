import Link from "next/link";
import type { CSSProperties, MouseEvent } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface IconButtonProps {
  icon: IconName;
  variant?: "outline" | "filled" | "inverse" | "ghost";
  /** Diâmetro: 48 (cabeçalhos) ou 44 (barras densas). Nunca abaixo do alvo de 44. */
  size?: 48 | 44;
  /** Ponto Urucum de não lido ("O Ponto"). O nome deve dizer o estado, ex.: "Notificações, 2 novas". */
  badge?: boolean;
  /** Nome acessível obrigatório. */
  label: string;
  iconColor?: string;
  href?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  className?: string;
  style?: CSSProperties;
}

const VARIANT = {
  outline: "bg-card-white text-strong border border-line-control hover:bg-section",
  filled: "bg-card text-strong border border-transparent hover:bg-hover",
  inverse: "bg-branco/15 text-branco border border-branco/40 hover:bg-branco/25",
  ghost: "bg-transparent text-strong border border-transparent hover:bg-section",
} as const;

/**
 * Botão circular de ícone para cabeçalhos de tela (voltar, mais, notificações); `badge` acende
 * o ponto Urucum.
 *
 * ```tsx
 * <IconButton icon="arrow-left" label="Voltar" />
 * <IconButton icon="bell" label="Notificações, 2 novas" badge />
 * <IconButton icon="bookmark" label="Salvar" variant="inverse" />
 * ```
 * - `outline` em telas brancas, `inverse` sobre foto ou Tinta, `ghost` em barras densas.
 */
export function IconButton({
  icon,
  variant = "outline",
  size = 48,
  badge = false,
  label,
  iconColor,
  href,
  pressed,
  disabled,
  onClick,
  className,
  style,
}: IconButtonProps) {
  const classes = cx(
    "relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-pill p-0",
    "transition-colors duration-(--dur-base) ease-(--ease-standard)",
    size === 48 ? "size-icon-btn" : "size-tap",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant],
    className,
  );
  const content = (
    <>
      <Icon name={icon} size={size === 48 ? 24 : 22} color={iconColor} />
      {badge && (
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 size-2 rounded-pill bg-urucum ring-2 ring-branco"
        />
      )}
    </>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={classes} style={style}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={classes}
      style={style}
    >
      {content}
    </button>
  );
}
