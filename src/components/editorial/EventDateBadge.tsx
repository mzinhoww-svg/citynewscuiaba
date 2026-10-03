import { formatDayMonth } from "@/lib/format/date";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface EventDateBadgeProps {
  startsAt: string;
  /**
   * badge = plaqueta de 56 px (evento relacionado) · cover = capa tipográfica do card da agenda
   * (96 px, data em destaque e ícone da categoria), usada quando o evento não tem imagem.
   */
  variant?: "badge" | "cover";
  /** Ícone da categoria (só na capa; decorativo). */
  icon?: IconName;
  className?: string;
}

/**
 * Plaqueta de data do evento (agenda): dia grande e mês curto, no fuso de Cuiabá. Na variante
 * `cover` vira a capa tipográfica do card: sem foto, nunca bloco chapado nem imagem genérica.
 *
 * ```tsx
 * <EventDateBadge startsAt={event.startsAt} />
 * <EventDateBadge startsAt={event.startsAt} variant="cover" icon="ticket" />
 * ```
 */
export function EventDateBadge({
  startsAt,
  variant = "badge",
  icon,
  className,
}: EventDateBadgeProps) {
  const [day = "", month = ""] = formatDayMonth(startsAt).split(" ");
  const cover = variant === "cover";
  return (
    <time
      dateTime={startsAt}
      data-testid={cover ? "event-cover" : undefined}
      className={cx(
        "flex shrink-0 flex-col items-center justify-center bg-cerrado-soft text-service",
        cover ? "size-24 gap-0.5 rounded-md" : "size-14 rounded-xs",
        className,
      )}
    >
      {cover && icon && <Icon name={icon} size={20} />}
      <span className={cx("font-black leading-none tabular-nums", cover ? "text-28" : "text-20")}>
        {day}
      </span>
      <span className="type-eyebrow text-service">{month}</span>
    </time>
  );
}
