import Link from "next/link";
import { useId } from "react";
import { CARD } from "@/content/pt-BR/portal-card";
import { PANORAMA_TEXT as T } from "@/content/pt-BR/sources";
import type { AggregatedView } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { OriginLabel } from "./OriginLabel";

export interface CoverageColumn {
  slug: string;
  name: string;
  count: number;
  /** Item mais recente do veículo no assunto (link para o original). */
  latest: AggregatedView;
  /** Horas desde a primeira publicação entre todos os veículos (0 = foi o primeiro). */
  hoursAfterFirst: number;
}

export interface CoverageCompareProps {
  topic: { title: string; href: string };
  citynewsCount: number;
  covered: CoverageColumn[];
  missing: { slug: string; name: string }[];
  now?: Date;
  className?: string;
}

/**
 * "Comparar coberturas" do Panorama (P16): uma coluna por veículo, com o CityNews primeiro em
 * destaque neutro, quem cobriu (itens, diferença para a primeira publicação, último link com
 * rótulo AGREGADO) e quem ficou sem cobertura. Sem ranking de qualidade.
 *
 * ```tsx
 * <CoverageCompare topic={{ title, href }} citynewsCount={2} covered={cols} missing={[]} />
 * ```
 */
export function CoverageCompare({
  topic,
  citynewsCount,
  covered,
  missing,
  now,
  className,
}: CoverageCompareProps) {
  const id = useId();
  const cell = "flex min-w-0 flex-col gap-2 border border-line-section bg-card-white p-4";
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-4", className)}>
      <div className="flex flex-col gap-1.5">
        <h2 id={id} className="type-section text-strong">
          {T.compareTitle}
        </h2>
        <p className="type-body text-body">{T.compareIntro(topic.title)}</p>
        <p className="type-meta font-semibold text-meta">
          {T.compareSummary(covered.length, missing.length)}
        </p>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <li className={cx(cell, "border-line-strong")}>
          <p className="type-eyebrow text-strong">{T.citynews}</p>
          <p className="type-body text-body">{T.citynewsCount(citynewsCount)}</p>
          <Link
            href={topic.href}
            className="mt-auto inline-flex min-h-tap items-center gap-1 text-14 font-semibold text-link underline-offset-4 hover:underline"
          >
            {T.citynewsLink}
            <Icon name="chevron-right" size={14} />
          </Link>
        </li>
        {covered.map((c) => (
          <li key={c.slug} className={cell} data-coverage="covered">
            <p className="type-eyebrow text-strong">{c.name}</p>
            <p className="type-meta text-meta">
              {T.covered} · {T.itemsCount(c.count)} ·{" "}
              {c.hoursAfterFirst === 0 ? T.first : T.difference(c.hoursAfterFirst)}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {c.latest.labels.shown.map((l) => (
                <OriginLabel key={l.kind} label={l} />
              ))}
            </div>
            <a
              href={c.latest.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-3 type-headline-sm text-strong underline-offset-4 hover:underline"
            >
              {c.latest.title}
              <span className="sr-only">
                {". "}
                {CARD.openIn(c.name)}, {CARD.newTab}
              </span>
            </a>
            {c.latest.publishedAt && (
              <p className="mt-auto type-meta text-meta tabular-nums">
                {formatWhen(c.latest.publishedAt, now)}
              </p>
            )}
          </li>
        ))}
        {missing.map((m) => (
          <li key={m.slug} className={cx(cell, "bg-section")} data-coverage="missing">
            <p className="type-eyebrow text-strong">{m.name}</p>
            <p className="flex items-center gap-1.5 type-meta text-meta">
              <Icon name="x" size={14} />
              {T.noCoverage}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
