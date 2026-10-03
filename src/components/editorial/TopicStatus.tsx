import type { TopicState } from "@/lib/db/queries/types";
import { TOPIC_STATE_TEXT } from "@/content/pt-BR/portal-card";
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
 * Selo de situação do assunto: hoje nenhum estado aparece para o público (R16, R34); "Corrigido",
 * "Em apuração", "Confirmado" e "Encerrado" ficam só no Estúdio. Renderiza só se houver texto.
 *
 * ```tsx
 * <TopicStatus state="corrigido" />
 * ```
 * - Ícone + texto; a cor só reforça.
 */
export function TopicStatus({ state, className }: TopicStatusProps) {
  const text = TOPIC_STATE_TEXT[state];
  if (!text) return null;
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
      {text}
    </span>
  );
}
