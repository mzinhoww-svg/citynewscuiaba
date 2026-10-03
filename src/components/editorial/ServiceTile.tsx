import Link from "next/link";
import { cx } from "../cx";
import { Icon, type IconName } from "../ui/Icon";

export interface ServiceTileProps {
  href: string;
  title: string;
  description?: string;
  icon: IconName;
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Atalho de serviço e utilidade pública (Cerrado): clima, ônibus, vagas, saúde.
 *
 * ```tsx
 * <ServiceTile href="/servicos" title="Vagas de emprego" description="Mutirão no sábado" icon="users" />
 * ```
 */
export function ServiceTile({
  href,
  title,
  description,
  icon,
  as: Heading = "h3",
  className,
}: ServiceTileProps) {
  return (
    <article
      className={cx(
        "relative flex min-h-tap items-start gap-3 border border-line-section bg-card-white p-4 [--card-radius:var(--r-0)]",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:border-cerrado",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-pill bg-cerrado-soft text-service"
      >
        <Icon name={icon} size={20} />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <Heading className="type-nav-title text-strong">
          <Link href={href} className="card-link no-underline">
            {title}
          </Link>
        </Heading>
        {description && <p className="hidden type-meta text-meta sm:block">{description}</p>}
      </div>
    </article>
  );
}
