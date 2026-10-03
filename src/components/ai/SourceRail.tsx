import Link from "next/link";
import { useId } from "react";
import { ASK } from "@/content/pt-BR/ask";
import type { SourceRef } from "@/lib/ai/answer";
import { formatWhen } from "@/lib/format/date";
import { cx } from "../cx";
import { OriginLabel } from "../editorial/OriginLabel";
import { Icon } from "../ui/Icon";

export interface SourceRailProps {
  sources: SourceRef[];
  title?: string;
  /** Prefixo dos ids (`fonte` → `fonte-1`), alvo das citações. */
  idPrefix?: string;
  now?: Date;
  className?: string;
}

/**
 * Lista numerada das fontes de uma resposta da IA (P13): rótulo de origem, veículo, data e link.
 * Matéria do CityNews abre aqui; item de outro veículo abre o original em nova aba.
 *
 * ```tsx
 * <SourceRail sources={answer.sources} />
 * ```
 */
export function SourceRail({
  sources,
  title = ASK.sourcesTitle,
  idPrefix = "fonte",
  now,
  className,
}: SourceRailProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      <ol className="flex flex-col divide-y divide-line-section border-y border-line-section">
        {sources.map((s, i) => (
          <li
            key={`${s.kind}:${s.id}`}
            id={`${idPrefix}-${i + 1}`}
            className="flex scroll-mt-24 gap-3 py-3 target:bg-ia-soft"
          >
            <span
              aria-hidden="true"
              className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-xs border border-ai text-13 font-semibold text-ai tabular-nums"
            >
              {i + 1}
            </span>
            <div className="flex min-w-0 flex-col gap-1.5">
              <span className="sr-only">{ASK.citedBy(i + 1)}: </span>
              <div>
                {s.label.kind === "original" || s.label.kind === "aggregated" ? (
                  <OriginLabel label={s.label} />
                ) : (
                  <p className="type-meta text-meta">{s.label.text}</p>
                )}
              </div>
              <p className="type-body font-semibold text-strong">
                {s.kind === "article" ? (
                  <Link href={s.url} className="text-strong underline-offset-4 hover:underline">
                    {s.title}
                  </Link>
                ) : (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-strong underline-offset-4 hover:underline"
                  >
                    {s.title}
                    <span className="sr-only">
                      {". "}
                      {ASK.openSource(s.sourceName)}, {ASK.newTab}
                    </span>
                  </a>
                )}
              </p>
              <p className="flex flex-wrap items-center gap-x-1.5 type-meta text-meta">
                <span>{s.sourceName}</span>
                {s.publishedAt && (
                  <>
                    <span aria-hidden="true">·</span>
                    <time dateTime={s.publishedAt} className="tabular-nums">
                      {formatWhen(s.publishedAt, now)}
                    </time>
                  </>
                )}
                {s.kind === "aggregated" && (
                  <Icon name="external-link" size={14} className="text-link" />
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
