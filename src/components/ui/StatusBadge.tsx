import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export type StatusTone = "success" | "warn" | "danger" | "info" | "neutral" | "ai" | "correction";

/**
 * Par fundo suave + texto de cada tom. Todos os pares ficam ≥ 4,5:1 no claro e no escuro
 * (verificado em `StatusBadge.test.tsx` a partir de `tokens.css`).
 */
export const STATUS_TONE_CLASSES: Record<StatusTone, string> = {
  success: "bg-cerrado-soft text-service",
  warn: "bg-atencao-soft text-warn",
  danger: "bg-erro-soft text-danger",
  info: "bg-section text-strong",
  neutral: "bg-section text-meta",
  ai: "bg-ia-soft text-ai",
  correction: "bg-urucum-soft text-link",
};

const SIZE: Record<"sm" | "md", { classes: string; icon: 14 | 16 }> = {
  sm: { classes: "min-h-6.5 gap-1.5 px-2 py-1 text-13", icon: 14 },
  md: { classes: "min-h-8 gap-2 px-2.5 py-1.5 text-14", icon: 16 },
};

export interface StatusBadgeProps {
  tone: StatusTone;
  /** Obrigatório: o selo nunca depende só de cor. Decorativo (`aria-hidden`). */
  icon: IconName;
  children: ReactNode;
  /** `sm` (padrão) em tabelas e listas; `md` em cabeçalhos de detalhe. */
  size?: "sm" | "md";
  className?: string;
}

/**
 * Selo de status único do Estúdio e do Control Center: tom + ícone + texto.
 *
 * ```tsx
 * <StatusBadge tone="warn" icon="circle-pause">Pausada automaticamente</StatusBadge>
 * ```
 * - O texto carrega o sentido; o ícone e a cor reforçam.
 * - Texto longo trunca numa linha e o texto inteiro fica no `title`.
 * - Selos de domínio (`SourceStatusBadge`, `PushStatusBadge`) são mapas `status → { tone, icon, label }`.
 */
export function StatusBadge({ tone, icon, children, size = "sm", className }: StatusBadgeProps) {
  const look = SIZE[size];
  return (
    <span
      data-tone={tone}
      className={cx(
        "inline-flex min-w-0 max-w-full items-center rounded-xs font-semibold leading-none",
        look.classes,
        STATUS_TONE_CLASSES[tone],
        className,
      )}
    >
      <Icon name={icon} size={look.icon} />
      <span
        className="min-w-0 truncate"
        title={typeof children === "string" ? children : undefined}
      >
        {children}
      </span>
    </span>
  );
}
