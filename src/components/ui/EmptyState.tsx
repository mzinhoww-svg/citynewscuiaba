import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface EmptyStateProps {
  title: string;
  /** Explicação em linguagem simples. */
  children?: ReactNode;
  /** Próxima ação (links ou botões). */
  actions?: ReactNode;
  /** empty = nada encontrado · error = falha com "Tentar de novo". */
  tone?: "empty" | "error";
  icon?: IconName;
  /** Nível do título (padrão h2; use h1 quando o estado ocupa a página). */
  as?: "h1" | "h2" | "h3";
  className?: string;
}

/**
 * Estado vazio ou de erro das telas (docs/screens.md, estados padrão): explicação e próxima
 * ação, nunca uma área em branco.
 *
 * ```tsx
 * <EmptyState title="Nenhuma matéria de Mobilidade no Coxipó nos últimos 7 dias"
 *   actions={<Button href="?periodo=30d" size="md">Ver últimos 30 dias</Button>}>…</EmptyState>
 * ```
 */
export function EmptyState({
  title,
  children,
  actions,
  tone = "empty",
  icon,
  as: Heading = "h2",
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cx(
        "flex flex-col items-start gap-3 border border-line-section bg-card-white p-6",
        className,
      )}
    >
      <Icon
        name={icon ?? (tone === "error" ? "circle-alert" : "search")}
        size={24}
        className={tone === "error" ? "text-danger" : "text-meta"}
      />
      <Heading className="type-section text-strong">{title}</Heading>
      {children && <div className="max-w-read type-body text-body">{children}</div>}
      {actions && <div className="mt-1 flex flex-wrap items-center gap-3">{actions}</div>}
    </div>
  );
}
