import Link from "next/link";
import { GUIDE } from "@/content/pt-BR/guide";
import type { GuideListItemView } from "@/lib/db/queries/guide";
import { categoryBySlug } from "@/lib/guide/categories";
import { cx } from "../../cx";
import { VenueCover } from "./VenueCover";

export interface VenueCardProps {
  item: GuideListItemView;
  as?: "h2" | "h3";
  className?: string;
}

export function categoryLabel(slug: string): string {
  const c = categoryBySlug(slug);
  if (!c) return slug;
  return c.singular.charAt(0).toUpperCase() + c.singular.slice(1);
}

/** "4,6" para nota; vírgula decimal do pt-BR. */
export const ratingText = (n: number) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * Lugar na lista: posição, foto oficial ou cartão tipográfico, nome (o link do card), bairro, nota
 * e posição no ranking do TripAdvisor (com a fonte dita em texto), faixa de preço e nota do editor.
 * Sem contagem de curtidas nem comentários.
 */
export function VenueCard({ item, as: Heading = "h3", className }: VenueCardProps) {
  const v = item.venue;
  const source =
    v.ratingSource === "google" || v.ratingSource === "tripadvisor" ? v.ratingSource : null;
  const meta = [v.neighborhood, v.priceLevel ? GUIDE.venue.price(v.priceLevel) : null].filter(
    Boolean,
  );
  return (
    <article
      className={cx(
        "relative flex flex-col gap-4 border-t border-line-subtle py-6 sm:flex-row sm:gap-6",
        className,
      )}
    >
      <VenueCover
        name={v.name}
        categoryLabel={categoryLabel(v.category)}
        photo={v.photos[0]}
        size="card"
      />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="type-eyebrow text-service">
          <span className="tabular-nums">{GUIDE.list.position(item.position)}</span>
        </p>
        <Heading className="type-headline-md text-strong">
          <Link href={v.href} className="card-link no-underline">
            {v.name}
          </Link>
        </Heading>
        {meta.length > 0 && <p className="type-meta text-meta">{meta.join(" · ")}</p>}
        {source && v.rating !== null && (
          <p className="type-body text-body">
            {GUIDE.list.rating(ratingText(v.rating), v.ratingCount, source)}
          </p>
        )}
        {v.tripadvisorRank !== null && (
          <p className="type-meta text-meta">{GUIDE.list.rank(v.tripadvisorRank)}</p>
        )}
        {v.address && <p className="type-meta text-meta">{v.address}</p>}
        {item.note && <p className="max-w-read type-body text-strong">{item.note}</p>}
      </div>
    </article>
  );
}
