import Link from "next/link";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface SectionTileProps {
  href: string;
  name: string;
  /** Linha de apoio, por exemplo "3 matérias hoje". */
  meta: string;
  icon: IconName;
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Atalho de editoria no Explorar (P07): ícone, nome e matérias do dia. O card inteiro é
 * clicável pelo link do título (R7).
 *
 * ```tsx
 * <SectionTile href="/cidade" name="Cidade" meta="3 matérias hoje" icon="house" />
 * ```
 */
export function SectionTile({
  href,
  name,
  meta,
  icon,
  as: Heading = "h3",
  className,
}: SectionTileProps) {
  return (
    <article
      className={cx(
        "relative flex min-h-tap items-center gap-3 border border-line-section bg-card-white p-4 [--card-radius:var(--r-0)]",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:border-line-strong",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-section text-strong"
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading className="type-nav-title text-strong">
          <Link href={href} className="card-link no-underline">
            {name}
          </Link>
        </Heading>
        <p className="type-meta text-meta tabular-nums">{meta}</p>
      </div>
    </article>
  );
}
