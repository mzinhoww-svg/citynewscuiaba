import type { AggregatedView } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal";
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
 * - Superfície neutra (`--surface-aggregated`) e rótulo AGREGADO · fonte.
 * - O link tem o nome do veículo e avisa que abre em nova aba.
 */
export function AggregatedCard({
  item,
  as: Heading = "h3",
  now,
  surface = "aggregated",
  className,
}: AggregatedCardProps) {
  const when = item.publishedAt ? formatWhen(item.publishedAt, now) : "";
  const labels = item.labels.shown;
  return (
    <article
      className={cx(
        "relative flex flex-col gap-2.5 border border-line-section p-4 [--card-radius:var(--r-0)]",
        surface === "aggregated" ? "bg-aggregated" : "bg-card-white",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:border-line-strong",
        className,
      )}
    >
      {labels.length > 0 && (
        <div className="relative flex flex-wrap gap-1.5">
          {labels.map((l) => (
            <OriginLabel key={l.kind} label={l} />
          ))}
        </div>
      )}
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
      {item.summary && <p className="line-clamp-3 type-body text-body">{item.summary}</p>}
      <p className="mt-auto flex flex-wrap items-center gap-x-1.5 type-meta text-meta">
        {when && (
          <>
            <span className="tabular-nums">{when}</span>
            <span aria-hidden="true">·</span>
          </>
        )}
        <span aria-hidden="true" className="inline-flex items-center gap-1 font-semibold text-link">
          {CARD.openIn(item.sourceName)}
          <Icon name="external-link" size={14} />
        </span>
      </p>
    </article>
  );
}
