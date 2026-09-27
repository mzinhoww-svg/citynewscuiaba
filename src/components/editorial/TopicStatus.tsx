import type { TopicState } from "@/lib/db/queries/types";
import { TOPIC_STATE_TEXT } from "@/content/pt-BR/portal";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface TopicStatusProps {
  state: TopicState;
  className?: string;
}

const LOOK: Record<TopicState, { classes: string; icon: IconName }> = {
  em_apuracao: { classes: "bg-atencao-soft text-warn", icon: "clock" },
  confirmado: { classes: "bg-cerrado-soft text-service", icon: "check" },
  corrigido: { classes: "bg-urucum-soft text-link", icon: "circle-alert" },
  encerrado: { classes: "bg-section text-meta", icon: "lock" },
};

/**
 * Situação de um assunto: Em apuração, Confirmado, Corrigido ou Encerrado.
 *
 * ```tsx
 * <TopicStatus state="em_apuracao" />
 * ```
 * - Ícone + texto; a cor só reforça.
 */
export function TopicStatus({ state, className }: TopicStatusProps) {
  const look = LOOK[state];
  return (
    <span
      data-state={state}
      className={cx(
        "inline-flex min-h-6.5 items-center gap-1.5 rounded-xs px-2 py-1 text-13 font-semibold leading-none",
        look.classes,
        className,
      )}
    >
      <Icon name={look.icon} size={14} />
      {TOPIC_STATE_TEXT[state]}
    </span>
  );
}
