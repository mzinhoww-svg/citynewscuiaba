import Link from "next/link";
import { AGENDA } from "@/content/pt-BR/portal-agenda";
import type { EventView } from "@/lib/db/queries/types";
import { originNote } from "@/lib/agenda/origin-note";
import { formatDayMonth, formatHour, localDateKey } from "@/lib/format/date";
import { cx } from "../cx";
import { Button } from "../ui/Button";
import type { IconName } from "../ui/Icon";
import { EventDateBadge } from "./EventDateBadge";
import { ImageCaption } from "./ImageCaption";
import { Photo } from "./Photo";
import { SaveEventButton } from "./SaveEventButton";

export interface EventCardProps {
  event: EventView;
  className?: string;
}

/** Ícone da categoria na capa tipográfica (sprite existente; sem categoria mapeada: calendário). */
const CATEGORY_ICONS: Record<string, IconName> = {
  cultura: "book-open",
  musica: "play",
  teatro: "ticket",
  cinema: "camera",
  esporte: "flag",
  feira: "map-pin",
  gastronomia: "flame",
  infantil: "users",
};

/** "20h até 1h30 do dia seguinte · Sesc Arsenal, Centro": hora e local numa linha só. */
export function eventWhenWhere(e: EventView): string {
  const end = e.endsAt
    ? localDateKey(e.endsAt) !== localDateKey(e.startsAt)
      ? `${AGENDA.until(formatHour(e.endsAt))} ${AGENDA.nextDay}`
      : AGENDA.until(formatHour(e.endsAt))
    : "";
  return [
    [formatHour(e.startsAt), end].filter(Boolean).join(" "),
    e.neighborhood ? `${e.venue}, ${e.neighborhood}` : e.venue,
  ].join(" · ");
}

/**
 * Card de evento da agenda por dia: a foto de divulgação (miniatura, variante 480) com a legenda
 * "Foto: reprodução web · {fonte}" e "Ver original", ou, sem foto, a capa tipográfica com data e
 * ícone da categoria; título como link (o card inteiro é clicável), "hora · local", preço,
 * **Salvar** e **Calendário** (arquivo .ics). Os botões e a legenda ficam acima do link do card.
 *
 * ```tsx
 * <EventCard event={event} />
 * ```
 * - Evento gratuito diz "Gratuito" em texto; o preço pago vem em reais.
 */
export function EventCard({ event: e, className }: EventCardProps) {
  const category = AGENDA.categories[e.category] ?? e.category;
  const note = originNote(e);
  const image = e.image;
  return (
    <article
      className={cx(
        "relative flex items-start gap-4 border-t border-line-subtle py-4 [--card-radius:var(--r-0)]",
        className,
      )}
    >
      {image ? (
        // Miniatura decorativa: o título ao lado já nomeia o evento; a origem vai na legenda.
        <div data-testid="event-thumb" className="contents">
          <Photo
            src={image.src}
            alt=""
            ratio={1}
            radius="md"
            sizes="6rem"
            fit={image.kind === "reproduction" ? "contain" : "cover"}
            className="size-24"
          />
        </div>
      ) : (
        <EventDateBadge
          startsAt={e.startsAt}
          variant="cover"
          icon={CATEGORY_ICONS[e.category] ?? "calendar"}
        />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="type-eyebrow text-eyebrow">
          {category} · {AGENDA.origins[e.origin]}
        </p>
        <h3 className="type-headline-md text-strong">
          <Link href={e.href} className="card-link no-underline">
            {e.title}
          </Link>
        </h3>
        <p className="type-meta text-meta">
          {image && (
            <time dateTime={e.startsAt} className="font-semibold text-strong">
              {formatDayMonth(e.startsAt)} ·{" "}
            </time>
          )}
          {eventWhenWhere(e)}
        </p>
        {note.length > 0 && (
          <p className="type-meta text-meta" data-testid="event-origin">
            {note.join(" · ")}
          </p>
        )}
        <p className="type-meta text-meta">
          <span className={cx("font-semibold", e.isFree ? "text-service" : "text-strong")}>
            {e.priceUnknown
              ? AGENDA.priceUnknown
              : e.isFree
                ? AGENDA.free
                : AGENDA.price(e.priceCents ?? 0)}
          </span>
          {" · "}
          {AGENDA.age(e.ageRating)}
        </p>
        {image && <ImageCaption image={image} />}
        <div className="relative flex flex-wrap gap-2 pt-1.5">
          <SaveEventButton contentRef={`event:${e.id}`} title={e.title} href={e.href} />
          <Button
            href={`/api/ics/${e.slug}`}
            download
            variant="outline"
            size="md"
            icon="plus"
            aria-label={AGENDA.addCalendarLabel(e.title)}
          >
            {AGENDA.addCalendarShort}
          </Button>
        </div>
      </div>
    </article>
  );
}
