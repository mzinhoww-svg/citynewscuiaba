import { useId } from "react";
import { cx } from "../cx";
import { SourceAvatar } from "./SourceAvatar";

export interface PopularSourcesRailProps {
  title: string;
  sources: { slug: string; name: string; href: string; code?: string; logo?: string }[];
  className?: string;
}

/**
 * Fileira "Mais acessadas em Cuiabá" (DESIGN.md §6): avatares de 64 px (72 no desktop), nome em
 * até 2 linhas, rolagem horizontal com `scroll-snap`. Sem fontes, não renderiza nada.
 *
 * ```tsx
 * <PopularSourcesRail title="Mais acessadas em Cuiabá" sources={popular} />
 * ```
 */
export function PopularSourcesRail({ title, sources, className }: PopularSourcesRailProps) {
  const id = useId();
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {sources.map((s) => (
          <li key={s.slug} className="snap-start">
            <SourceAvatar name={s.name} code={s.code} image={s.logo} href={s.href} size="rail" />
          </li>
        ))}
      </ul>
    </section>
  );
}
