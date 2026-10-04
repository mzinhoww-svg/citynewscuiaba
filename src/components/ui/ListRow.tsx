import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface ListRowProps {
  icon?: IconName;
  leading?: ReactNode;
  label: ReactNode;
  /** Segunda linha, menor, embaixo do rótulo (estado ou resumo do que a linha abre). */
  description?: ReactNode;
  value?: string;
  /** chevron | check (com `selected`) | nó próprio (ex.: Toggle) | null */
  trailing?: "chevron" | "check" | ReactNode;
  selected?: boolean;
  danger?: boolean;
  bordered?: boolean;
  /** Linha que navega. */
  href?: string;
  /** Linha que executa ação. Não combine com um `trailing` interativo. */
  onClick?: () => void;
  className?: string;
  style?: CSSProperties;
}

/**
 * Linha de Configurações, Idioma e Segurança. Empilhe com 12 px de espaço (`bordered`) ou dentro
 * de um grupo com divisórias (`bordered={false}`).
 *
 * ```tsx
 * <ListRow icon="globe" label="Idioma" value="Português" href="/perfil/idioma" />
 * <ListRow label="Português (Brasil)" trailing="check" selected onClick={choose} />
 * <ListRow label="Notificações" bordered={false} trailing={<Toggle defaultChecked label="Notificações" />} />
 * <ListRow icon="log-out" label="Sair" danger trailing={null} onClick={logout} />
 * ```
 * - Com `href` vira link; com `onClick` vira botão; sem nenhum, é só uma linha.
 */
export function ListRow({
  icon,
  leading,
  label,
  description,
  value,
  trailing = "chevron",
  selected = false,
  danger = false,
  bordered = true,
  href,
  onClick,
  className,
  style,
}: ListRowProps) {
  const classes = cx(
    "flex min-h-input w-full items-center gap-3.5 px-4 text-left no-underline",
    description != null && "py-2.5",
    danger ? "text-danger" : "text-strong",
    bordered
      ? cx("rounded-md border bg-card-white", selected ? "border-urucum" : "border-line-subtle")
      : "bg-transparent",
    (href || onClick) && "cursor-pointer hover:bg-section",
    className,
  );
  const content = (
    <>
      {leading}
      {icon && <Icon name={icon} />}
      {description ? (
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-16 font-medium leading-snug">{label}</span>
          <span className="text-14 leading-snug text-meta">{description}</span>
        </span>
      ) : (
        <span className="flex-1 text-16 font-medium leading-snug">{label}</span>
      )}
      {value && <span className="text-14 text-meta">{value}</span>}
      {trailing === "chevron" && (
        <Icon name="chevron-right" size={20} color="var(--text-placeholder)" />
      )}
      {trailing === "check" && selected && <Icon name="check" size={20} color="var(--text-link)" />}
      {trailing !== "chevron" && trailing !== "check" && trailing}
    </>
  );
  if (href) {
    return (
      <Link
        href={href}
        className={classes}
        style={style}
        aria-current={selected ? "true" : undefined}
      >
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={trailing === "check" ? selected : undefined}
        className={classes}
        style={style}
      >
        {content}
      </button>
    );
  }
  return (
    <div className={classes} style={style}>
      {content}
    </div>
  );
}
