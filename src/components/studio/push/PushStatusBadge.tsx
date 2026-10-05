import { PUSH_ADMIN_TEXT } from "@/content/pt-BR/notifications-admin";
import type { SendStatus } from "@/lib/push/types";
import { cx } from "../../cx";
import type { IconName } from "../../ui/Icon";
import { StatusBadge, type StatusTone } from "../../ui/StatusBadge";

export interface PushStatusBadgeProps {
  status: SendStatus;
  /** Motivo gravado (`status_reason`); aparece em texto ao lado. */
  reason?: string | null;
  className?: string;
}

const LOOK: Record<SendStatus, { tone: StatusTone; icon: IconName }> = {
  pending_approval: { tone: "warn", icon: "clock" },
  scheduled: { tone: "info", icon: "calendar" },
  queued: { tone: "info", icon: "list" },
  dispatching: { tone: "info", icon: "activity" },
  sent: { tone: "success", icon: "check" },
  paused: { tone: "warn", icon: "circle-pause" },
  cancelled: { tone: "neutral", icon: "ban" },
  rejected: { tone: "danger", icon: "x" },
  expired: { tone: "neutral", icon: "history" },
};

/**
 * Estado de um envio de A09 (spec §10.3–10.4): mapa `status → { tone, icon, label }` sobre
 * `StatusBadge`; o motivo em texto quando houver. Nunca depende só de cor.
 */
export function PushStatusBadge({ status, reason, className }: PushStatusBadgeProps) {
  const look = LOOK[status];
  return (
    <span
      data-status={status}
      className={cx("inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5", className)}
    >
      <StatusBadge tone={look.tone} icon={look.icon}>
        {PUSH_ADMIN_TEXT.status[status]}
      </StatusBadge>
      {reason && <span className="type-meta text-meta">{reason}</span>}
    </span>
  );
}
