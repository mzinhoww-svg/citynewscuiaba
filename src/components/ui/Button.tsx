import Link from "next/link";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "outline-strong"
  | "accent"
  | "text"
  | "danger"
  | "destructive";

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
  /**
   * Envio em andamento: desabilita, marca `aria-busy` e troca o texto por `loadingLabel`
   * ("Salvando…" por padrão). Evita o segundo clique e diz o que está acontecendo.
   */
  loading?: boolean;
  loadingLabel?: string;
  type?: "button" | "submit";
  /** Com `href`, o botão vira link (mesma aparência). */
  href?: string;
  /**
   * Com `href`, o link baixa um arquivo (rota que responde `Content-Disposition: attachment`):
   * renderiza um `<a download>` comum, sem a navegação do roteador do Next (que faz uma busca
   * RSC e só depois navega, o que o WebKit não trata como download).
   */
  download?: boolean;
  /** Estado alternável (Seguir/Seguindo, Salvar). */
  pressed?: boolean;
  /**
   * Com `icon`, abaixo de 640 px vira botão só de ícone: o texto fica para leitor de tela e
   * continua sendo o nome acessível. A partir de 640 px mostra ícone e texto.
   */
  collapseLabel?: boolean;
  /** Botão de envio com outra Server Action no mesmo formulário (ex.: "Receber link por e-mail"). */
  formAction?: (formData: FormData) => void | Promise<void>;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  children?: ReactNode;
  "aria-label"?: string;
  /** Texto que explica o botão (ex.: o motivo de estar desabilitado). */
  "aria-describedby"?: string;
  /** Só quando outro elemento precisa apontar para este botão (ex.: âncora "#id"). */
  id?: string;
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
  secondary: "bg-action-secondary text-strong border border-transparent hover:bg-hover",
  outline: "bg-card-white text-strong border border-line-control hover:bg-section",
  "outline-strong": "bg-transparent text-strong border border-line-strong hover:bg-section",
  /* R14: Tinta sobre Urgente (5,05:1); branco sobre Urucum reprova AA. */
  accent: "bg-urgente text-tinta border border-transparent",
  text: "bg-transparent text-link underline-offset-4 hover:text-strong hover:underline",
  danger: "bg-transparent text-danger underline-offset-4 hover:underline",
  /* Ação irreversível em confirmação: Erro sólido; branco 5,7:1 (claro), Noite 7,8:1 (escuro). */
  destructive: "bg-danger text-on-inverse border border-transparent hover:opacity-90",
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
 * <Button loading={pending} type="submit">Salvar</Button>
 * <Button variant="destructive">Apagar matéria</Button>
 * ```
 * - Tamanhos: lg 56 (formulários, folhas), md 44, sm 36 (Seguir em cards de tema).
 * - `accent` (Urgente com texto Tinta) só para momentos de "Agora", nunca como CTA padrão.
 * - `destructive` (Erro sólido) só na ação final de uma confirmação (`ConfirmDialog`); `danger`
 *   (texto) para "Sair" e afins. Em formulário com Server Action, prefira `SubmitButton`.
 * - Desabilitado = Névoa 2 + texto de placeholder. Pressionado = escala .98.
 */
export function Button({
  variant = "primary",
  size = "lg",
  icon,
  iconRight,
  leading,
  fullWidth = false,
  disabled: disabledProp = false,
  loading = false,
  loadingLabel,
  type = "button",
  href,
  download = false,
  pressed,
  collapseLabel = false,
  formAction,
  onClick,
  children,
  id,
  className,
  style,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: ButtonProps) {
  const inline = variant === "text" || variant === "danger";
  const disabled = disabledProp || loading;
  const s = SIZE[size];
  const classes = cx(
    fullWidth ? "flex w-full" : "inline-flex",
    "items-center justify-center gap-2.5 whitespace-nowrap rounded-pill font-semibold leading-none",
    "cursor-pointer transition-[transform,background-color,color] duration-(--dur-fast) ease-(--ease-standard) motion-safe:active:scale-98",
    inline ? "min-h-tap px-0 text-16" : s.box,
    collapseLabel && icon && "max-sm:w-tap max-sm:gap-0 max-sm:px-0",
    disabled
      ? cx(
          "cursor-not-allowed border border-transparent text-placeholder",
          inline ? "bg-transparent" : "bg-section",
        )
      : VARIANT[variant],
    className,
  );
  const content = loading ? (
    (loadingLabel ?? UI.saving)
  ) : (
    <>
      {leading}
      {icon && <Icon name={icon} size={s.icon} />}
      {collapseLabel && icon ? <span className="max-sm:sr-only">{children}</span> : children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </>
  );

  if (href && !disabled && download) {
    return (
      <a id={id} href={href} download className={classes} style={style} aria-label={ariaLabel}>
        {content}
      </a>
    );
  }
  if (href && !disabled) {
    return (
      <Link id={id} href={href} className={classes} style={style} aria-label={ariaLabel}>
        {content}
      </Link>
    );
  }
  return (
    <button
      id={id}
      type={type}
      disabled={disabled}
      onClick={onClick}
      formAction={formAction}
      aria-pressed={pressed}
      aria-busy={loading || undefined}
      aria-label={loading ? undefined : ariaLabel}
      aria-describedby={ariaDescribedBy}
      className={classes}
      style={style}
    >
      {content}
    </button>
  );
}
