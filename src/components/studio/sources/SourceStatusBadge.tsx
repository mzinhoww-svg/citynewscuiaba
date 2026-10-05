import {
  SOURCE_STATUS_TEXT,
  STATUS_REASON_TEXT,
  type DisplayStatus,
} from "@/content/pt-BR/sources-admin";
import type { StatusReason } from "@/lib/sources";
import { cx } from "../../cx";
import type { IconName } from "../../ui/Icon";
import { StatusBadge, type StatusTone } from "../../ui/StatusBadge";

export interface SourceStatusBadgeProps {
  status: DisplayStatus;
  /** Motivo gravado (`status_reason`); aparece em texto ao lado do status. */
  reason?: StatusReason | null;
  className?: string;
}

const LOOK: Record<DisplayStatus, { tone: StatusTone; icon: IconName }> = {
  active: { tone: "success", icon: "check" },
  degraded: { tone: "warn", icon: "circle-alert" },
  paused: { tone: "neutral", icon: "circle-pause" },
  auto_paused: { tone: "warn", icon: "circle-pause" },
  blocked: { tone: "danger", icon: "ban" },
  archived: { tone: "neutral", icon: "archive" },
};

/**
 * Status de uma fonte no painel (spec §8): mapa `status → { tone, icon, label }` sobre
 * `StatusBadge`, e o motivo em texto quando houver.
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
      <StatusBadge tone={look.tone} icon={look.icon}>
        {SOURCE_STATUS_TEXT[status]}
      </StatusBadge>
      {reason && <span className="type-meta text-meta">{STATUS_REASON_TEXT[reason]}</span>}
    </span>
  );
}
