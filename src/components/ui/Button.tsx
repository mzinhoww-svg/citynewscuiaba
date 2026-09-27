import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant =
  "primary" | "secondary" | "outline" | "outline-strong" | "accent" | "text" | "danger";

export interface ButtonProps {
  variant?: ButtonVariant;
  /** lg 56 (CTAs de largura total) · md 44 · sm 36 (Seguir), com alvo de toque de 44 */
  size?: "lg" | "md" | "sm";
  icon?: IconName;
  iconRight?: IconName;
  /** Nó à esquerda, por exemplo a marca de um provedor de login */
  leading?: ReactNode;
  fullWidth?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  /** Com `href`, o botão vira link (mesma aparência). */
  href?: string;
  /** Estado alternável (Seguir/Seguindo, Salvar). */
  pressed?: boolean;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
}

const SIZE = {
  lg: { box: "h-button px-6 text-16", icon: 20 },
  md: { box: "h-tap px-5 text-16", icon: 18 },
  sm: { box: "h-button-sm px-4 text-14 hit-area", icon: 16 },
} as const;

const VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-action-primary text-on-inverse border border-transparent active:bg-action-primary-pressed hover:bg-action-primary-pressed",
  secondary: "bg-action-secondary text-strong border border-transparent hover:bg-nevoa-2",
  outline: "bg-card-white text-strong border border-line-control hover:bg-section",
  "outline-strong": "bg-transparent text-strong border border-line-strong hover:bg-section",
  /* R14: Tinta sobre Urgente (5,05:1); branco sobre Urucum reprova AA. */
  accent: "bg-urgente text-tinta border border-transparent",
  text: "bg-transparent text-link underline-offset-4 hover:text-strong hover:underline",
  danger: "bg-transparent text-danger underline-offset-4 hover:underline",
};

/**
 * Botão em pílula. Use `primary` (Tinta) para a única ação principal da tela, `outline` para
 * login social e ações secundárias, `text` para links inline como "Ver tudo".
 *
 * ```tsx
 * <Button fullWidth>Entrar</Button>
 * <Button variant="outline" fullWidth leading={<GoogleMark />}>Entrar com Google</Button>
 * <Button size="sm">Seguir</Button> <Button size="sm" variant="outline-strong">Seguindo</Button>
 * <Button variant="danger">Sair</Button>
 * ```
 * - Tamanhos: lg 56 (formulários, folhas), md 44, sm 36 (Seguir em cards de tema).
 * - `accent` (Urgente com texto Tinta) só para momentos de "Agora", nunca como CTA padrão.
 * - Desabilitado = Névoa 2 + texto de placeholder. Pressionado = escala .98.
 */
export function Button({
  variant = "primary",
  size = "lg",
  icon,
  iconRight,
  leading,
  fullWidth = false,
  disabled = false,
  type = "button",
  href,
  pressed,
  onClick,
  children,
  className,
  style,
  "aria-label": ariaLabel,
}: ButtonProps) {
  const inline = variant === "text" || variant === "danger";
  const s = SIZE[size];
  const classes = cx(
    fullWidth ? "flex w-full" : "inline-flex",
    "items-center justify-center gap-2.5 whitespace-nowrap rounded-pill font-semibold leading-none",
    "cursor-pointer transition-[transform,background-color,color] duration-(--dur-fast) ease-(--ease-standard) motion-safe:active:scale-98",
    inline ? "min-h-tap px-0 text-16" : s.box,
    disabled
      ? cx(
          "cursor-not-allowed border border-transparent text-placeholder",
          inline ? "bg-transparent" : "bg-nevoa-2",
        )
      : VARIANT[variant],
    className,
  );
  const content = (
    <>
      {leading}
      {icon && <Icon name={icon} size={s.icon} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </>
  );

  if (href && !disabled) {
    return (
      <Link href={href} className={classes} style={style} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-pressed={pressed}
      aria-label={ariaLabel}
      className={classes}
      style={style}
    >
      {content}
    </button>
  );
}
