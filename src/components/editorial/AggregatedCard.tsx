import type { AggregatedView } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { plaqueOf } from "@/lib/labels";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { OriginLabel } from "./OriginLabel";

export interface AggregatedCardProps {
  item: AggregatedView;
  /** Nível do título (padrão h3). */
  as?: "h2" | "h3" | "h4";
  now?: Date;
  /** aggregated = superfície do Panorama · white = sobre seção que já é Panorama */
  surface?: "aggregated" | "white";
  /**
   * source = título é o link ("Abrir em {fonte}") · original = na página da própria fonte, o
   * título é texto e o link é "Abrir original" (o nome do veículo já está na página).
   */
  cta?: "source" | "original";
  className?: string;
}

/**
 * Item de outro veículo no Panorama: título original, data, resumo de até 2 frases escrito pelo
 * CityNews quando a política da fonte permite (nunca o texto da fonte), e link para o original em
 * nova aba (spec §4, D10). Nunca vira página de leitura no CityNews.
 *
 * ```tsx
 * <AggregatedCard item={item} />
 * ```
 * - Superfície neutra (`--surface-aggregated`) e uma só plaqueta, AGREGADO · fonte.
 * - O link tem o nome do veículo e avisa que abre em nova aba.
 */
export function AggregatedCard({
  item,
  as: Heading = "h3",
  now,
  surface = "aggregated",
  cta = "source",
  className,
}: AggregatedCardProps) {
  const when = item.publishedAt ? formatWhen(item.publishedAt, now) : "";
  const plaque = plaqueOf(item.labels);
  return (
    <article
      className={cx(
        "relative flex flex-col gap-2.5 border border-line-section p-4 [--card-radius:var(--r-0)]",
        surface === "aggregated" ? "bg-aggregated" : "bg-card-white",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:border-line-strong",
        className,
      )}
    >
      {plaque && (
        <div className="relative flex">
          <OriginLabel label={plaque} />
        </div>
      )}
      {cta === "source" ? (
        <Heading className="line-clamp-3 type-headline-sm text-strong">
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link no-underline"
          >
            {item.title}
            <span className="sr-only">
              {". "}
              {CARD.openIn(item.sourceName)}, {CARD.newTab}
            </span>
          </a>
        </Heading>
      ) : (
        <Heading className="line-clamp-3 type-headline-sm text-strong">{item.title}</Heading>
      )}
      {item.summary && <p className="line-clamp-3 type-body text-body">{item.summary}</p>}
      <p className="mt-auto flex flex-wrap items-center gap-x-1.5 type-meta text-meta">
        {when && (
          <>
            <span className="tabular-nums">{when}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        {cta === "source" ? (
          <span
            aria-hidden="true"
            className="inline-flex items-center gap-1 font-semibold text-link"
          >
            {CARD.openIn(item.sourceName)}
            <Icon name="external-link" size={14} />
          </span>
        ) : (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="card-link inline-flex min-h-tap items-center gap-1 font-semibold text-link"
          >
            {CARD.openOriginal}
            <span className="sr-only">
              {": "}
              {item.title}, {CARD.newTab}
            </span>
            <Icon name="external-link" size={14} />
          </a>
        )}
      </p>
    </article>
  );
}
