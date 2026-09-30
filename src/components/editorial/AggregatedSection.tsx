import Link from "next/link";
import { useId } from "react";
import type { AggregatedView } from "@/lib/db/queries/types";
import { HOME } from "@/content/pt-BR/portal-home";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { AggregatedCard } from "./AggregatedCard";

export interface AggregatedSectionProps {
  items: AggregatedView[];
  /** Destino de "Ver Panorama" (padrão /panorama). */
  moreHref?: string;
  className?: string;
}

/**
 * "Veja também em outros portais": o Panorama na home, sempre abaixo do conteúdo CityNews,
 * em superfície neutra, com aviso de que os links levam a outros veículos (PRODUCT.md §1).
 *
 * ```tsx
 * <AggregatedSection items={home.aggregated} />
 * ```
 */
export function AggregatedSection({
  items,
  moreHref = "/panorama",
  className,
}: AggregatedSectionProps) {
  const id = useId();
  if (items.length === 0) return null;
  return (
    <section
      aria-labelledby={id}
      className={cx("flex flex-col gap-4 bg-aggregated p-5 lg:p-8", className)}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1.5">
          <h2 id={id} className="type-section text-strong">
            {HOME.aggregatedTitle}
          </h2>
          <p className="flex items-start gap-1.5 type-meta text-meta">
            <Icon name="external-link" size={16} className="mt-px shrink-0" />
            {HOME.aggregatedNotice}
          </p>
        </div>
        <Link
          href={moreHref}
          className="inline-flex min-h-tap items-center text-14 font-semibold text-link underline-offset-4 hover:text-strong hover:underline"
        >
          {HOME.aggregatedMore}
        </Link>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="flex min-w-0">
            <AggregatedCard item={item} surface="white" className="min-w-0 flex-1" />
          </li>
        ))}
      </ul>
    </section>
  );
}
