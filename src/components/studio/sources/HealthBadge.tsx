import { HEALTH_LABEL } from "@/content/pt-BR/sources-admin";
import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export type HealthBadgeState = keyof typeof HEALTH_LABEL;

const ICON: Record<HealthBadgeState, IconName> = {
  saudavel: "check",
  atencao: "triangle-alert",
  critica: "circle-alert",
  sem_dados: "circle-help",
};
const TONE: Record<HealthBadgeState, string> = {
  saudavel: "text-service",
  atencao: "text-warn",
  critica: "text-danger",
  sem_dados: "text-meta",
};

export interface HealthBadgeProps {
  state: HealthBadgeState;
  /** Score de 0 a 100; `null` sem coletas. */
  score: number | null;
  className?: string;
}

/** Saúde operacional (score de 0 a 100): ícone, rótulo e número, nunca só cor. */
export function HealthBadge({ state, score, className }: HealthBadgeProps) {
  return (
    <span
      data-health={state}
      className={cx(
        "inline-flex items-center gap-1 type-meta font-semibold",
        TONE[state],
        className,
      )}
    >
      <Icon name={ICON[state]} size={16} />
      {HEALTH_LABEL[state]}
      {score !== null && <span className="font-normal tabular-nums text-meta">· {score}</span>}
    </span>
  );
}
