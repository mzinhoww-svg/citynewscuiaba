import { HEALTH_TEXT } from "@/content/pt-BR/sources-admin";
import type { HealthLabel } from "@/lib/sources";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export interface HealthBadgeProps {
  /** Score operacional (0–100) ou `null` sem dados. */
  score: number | null;
  label: HealthLabel;
  className?: string;
}

const LOOK: Record<HealthLabel, { classes: string; icon: IconName }> = {
  saudavel: { classes: "text-service", icon: "check" },
  atencao: { classes: "text-warn", icon: "circle-alert" },
  critica: { classes: "text-danger", icon: "circle-alert" },
  sem_dados: { classes: "text-meta", icon: "circle-help" },
};

/**
 * Saúde operacional (score calculado, D-F6): número + rótulo, com ícone decorativo.
 *
 * ```tsx
 * <HealthBadge score={82} label="saudavel" />
 * ```
 */
export function HealthBadge({ score, label, className }: HealthBadgeProps) {
  const look = LOOK[label];
  return (
    <span
      data-health={label}
      className={cx("inline-flex items-center gap-1.5 type-meta", look.classes, className)}
    >
      <Icon name={look.icon} size={14} />
      {score !== null && label !== "sem_dados" ? (
        <span>
          <span className="font-semibold">{score}</span> · {HEALTH_TEXT[label]}
        </span>
      ) : (
        <span>{HEALTH_TEXT[label]}</span>
      )}
    </span>
  );
}
