import { PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import type { SendStatus } from "@/lib/push/types";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export interface PushStatusBadgeProps {
  status: SendStatus;
  /** Motivo gravado (`status_reason`); aparece em texto ao lado. */
  reason?: string | null;
  className?: string;
}

const LOOK: Record<SendStatus, { classes: string; icon: IconName }> = {
  pending_approval: { classes: "bg-atencao-soft text-warn", icon: "clock" },
  scheduled: { classes: "bg-section text-strong", icon: "calendar" },
  queued: { classes: "bg-section text-strong", icon: "list" },
  dispatching: { classes: "bg-section text-strong", icon: "activity" },
  sent: { classes: "bg-cerrado-soft text-service", icon: "check" },
  paused: { classes: "bg-atencao-soft text-warn", icon: "circle-pause" },
  cancelled: { classes: "bg-section text-meta", icon: "ban" },
  rejected: { classes: "bg-erro-soft text-danger", icon: "x" },
  expired: { classes: "bg-section text-meta", icon: "history" },
};

/**
 * Estado de um envio de A09 (spec §10.3–10.4): ícone + texto; o motivo em texto quando houver.
 * Nunca depende só de cor.
 */
export function PushStatusBadge({ status, reason, className }: PushStatusBadgeProps) {
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
        {PUSH_ADMIN_TEXT.status[status]}
      </span>
      {reason && <span className="type-meta text-meta">{reason}</span>}
    </span>
  );
}
