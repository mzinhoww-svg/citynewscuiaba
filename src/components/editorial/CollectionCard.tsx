import Link from "next/link";
import type { CollectionView } from "@/lib/db/queries/types";
import { CARD } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface CollectionCardProps {
  collection: CollectionView;
  as?: "h2" | "h3";
  /** Home no celular: sem a descrição, para a página caber (outras telas mostram sempre). */
  compactOnMobile?: boolean;
  className?: string;
}

/**
 * Coleção editorial (guia temático): título, descrição e número de itens.
 *
 * ```tsx
 * <CollectionCard collection={c} />
 * ```
 */
export function CollectionCard({
  collection,
  as: Heading = "h3",
  compactOnMobile,
  className,
}: CollectionCardProps) {
  return (
    <article
      className={cx(
        "relative flex flex-col gap-2 bg-section p-4 [--card-radius:var(--r-0)]",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-nevoa-2",
        className,
      )}
    >
      <span aria-hidden="true" className="text-service">
        <Icon name="book-open" size={20} />
      </span>
      <Heading className="type-nav-title text-strong">
        <Link href={collection.href} className="card-link no-underline">
          {collection.title}
        </Link>
      </Heading>
      <p className={cx("line-clamp-2 type-body text-body", compactOnMobile && "max-sm:hidden")}>
        {collection.description}
      </p>
      <p className="mt-auto type-meta text-meta">{CARD.collectionItems(collection.itemCount)}</p>
    </article>
  );
}
