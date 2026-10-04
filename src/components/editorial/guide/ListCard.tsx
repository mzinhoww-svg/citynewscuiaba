import Link from "next/link";
import { GUIDE } from "@/content/pt-BR/guide";
import type { GuideListSummary } from "@/lib/db/queries/guide";
import { formatDate } from "@/lib/format/date";
import { cx } from "../../cx";
import { CategoryTag } from "../CategoryTag";
import { categoryLabel } from "./VenueCard";

export interface ListCardProps {
  list: GuideListSummary;
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Cartão de lista no índice do Guia: o título é o link (o card inteiro é clicável), quantos
 * lugares, os primeiros nomes e a data da última atualização. Lista patrocinada diz
 * "Patrocinado" em texto, nunca por cor.
 */
export function ListCard({ list, as: Heading = "h3", className }: ListCardProps) {
  return (
    <article
      className={cx(
        "relative flex flex-col gap-2 border-t border-line-strong py-5 [--card-radius:var(--r-0)]",
        className,
      )}
    >
      <CategoryTag tone="service">{categoryLabel(list.category)}</CategoryTag>
      <Heading className="type-headline text-strong">
        <Link href={list.href} className="card-link no-underline">
          {list.title}
        </Link>
      </Heading>
      {list.preview.length > 0 && (
        <p className="type-body text-body">
          {list.preview.join(", ")}
          {list.count > list.preview.length ? "…" : ""}
        </p>
      )}
      <p className="type-meta text-meta">
        {list.sponsored && list.sponsorName ? (
          <>
            <span className="font-semibold text-strong">
              {GUIDE.list.sponsoredBy(list.sponsorName)}
            </span>
            {" · "}
          </>
        ) : null}
        {GUIDE.index.places(list.count)}
        {list.refreshedAt ? (
          <>
            {" · "}
            <time dateTime={list.refreshedAt}>
              {GUIDE.index.updated(formatDate(list.refreshedAt))}
            </time>
          </>
        ) : null}
      </p>
    </article>
  );
}
