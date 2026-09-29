import {
  SOURCE_STATUS_HINT,
  SOURCE_STATUS_LABEL,
  STATUS_REASON_LABEL,
} from "@/content/pt-BR/sources-admin";
import type { SourceStatus, StatusReason } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

const ICON: Record<SourceStatus, IconName> = {
  active: "check",
  paused: "clock",
  degraded: "triangle-alert",
  blocked: "lock",
};

const TONE: Record<SourceStatus, string> = {
  active: "text-service",
  paused: "text-meta",
  degraded: "text-warn",
  blocked: "text-danger",
};

export interface SourceStatusBadgeProps {
  status: SourceStatus;
  /** Motivo do estado atual (mostrado em texto, ao lado do rótulo). */
  reason?: StatusReason | null;
  /** Fonte arquivada ("excluída"): sobrepõe o estado. */
  archived?: boolean;
  className?: string;
}

/**
 * Estado da fonte: ícone e texto, nunca só cor. O motivo aparece em texto ("Pausada · Pausa
 * automática por falhas"); arquivada aparece como "Arquivada".
 */
export function SourceStatusBadge({ status, reason, archived, className }: SourceStatusBadgeProps) {
  const label = archived ? "Arquivada" : SOURCE_STATUS_LABEL[status];
  const why = !archived && reason && status !== "active" ? STATUS_REASON_LABEL[reason] : null;
  return (
    <span
      data-status={archived ? "archived" : status}
      title={archived ? undefined : SOURCE_STATUS_HINT[status]}
      className={cx("inline-flex flex-wrap items-center gap-x-1 type-meta", className)}
    >
      <span
        className={cx(
          "inline-flex items-center gap-1 font-semibold",
          archived ? "text-meta" : TONE[status],
        )}
      >
        <Icon name={archived ? "eye-off" : ICON[status]} size={16} />
        {label}
      </span>
      {why && <span className="text-meta">· {why}</span>}
    </span>
  );
}
