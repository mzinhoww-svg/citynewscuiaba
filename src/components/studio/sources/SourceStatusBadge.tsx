import {
  SOURCE_STATUS_TEXT,
  STATUS_REASON_TEXT,
  type DisplayStatus,
} from "@/content/pt-BR/sources-admin";
import type { StatusReason } from "@/lib/sources";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export interface SourceStatusBadgeProps {
  status: DisplayStatus;
  /** Motivo gravado (`status_reason`); aparece em texto ao lado do status. */
  reason?: StatusReason | null;
  className?: string;
}

const LOOK: Record<DisplayStatus, { classes: string; icon: IconName }> = {
  active: { classes: "bg-cerrado-soft text-service", icon: "check" },
  degraded: { classes: "bg-atencao-soft text-warn", icon: "circle-alert" },
  paused: { classes: "bg-section text-meta", icon: "circle-pause" },
  auto_paused: { classes: "bg-atencao-soft text-warn", icon: "circle-pause" },
  blocked: { classes: "bg-erro-soft text-danger", icon: "ban" },
  archived: { classes: "bg-section text-meta", icon: "archive" },
};

/**
 * Status de uma fonte no painel (spec §8): ícone + texto, e o motivo em texto quando houver.
 *
 * ```tsx
 * <SourceStatusBadge status="auto_paused" reason="auto_failures" />
 * ```
 * - Nunca depende só de cor: o ícone é decorativo e o texto carrega o sentido.
 */
export function SourceStatusBadge({ status, reason, className }: SourceStatusBadgeProps) {
  const look = LOOK[status];
  return (
    <span
      data-status={status}
      className={cx("inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}
    >
      <span
        className={cx(
          "inline-flex min-h-6.5 items-center gap-1.5 rounded-xs px-2 py-1 text-13 font-semibold leading-none",
          look.classes,
        )}
      >
        <Icon name={look.icon} size={14} />
        {SOURCE_STATUS_TEXT[status]}
      </span>
      {reason && <span className="type-meta text-meta">{STATUS_REASON_TEXT[reason]}</span>}
    </span>
  );
}
