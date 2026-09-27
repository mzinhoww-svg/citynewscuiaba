import { useId } from "react";
import type { ArticleSource } from "@/lib/db/queries/types";
import { formatDateTime } from "@/lib/format/date";
import { ARTICLE } from "@/content/pt-BR/portal";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface SourcesListProps {
  sources: ArticleSource[];
  /** Matéria original sem fonte externa: mostra "apuração própria". */
  ownReporting?: boolean;
  className?: string;
}

/**
 * "Fontes" da matéria (P03): papel (primária, secundária, contexto), se a redação confirmou,
 * título original e link para o site de origem em nova aba.
 *
 * ```tsx
 * <SourcesList sources={article.sources} />
 * ```
 */
export function SourcesList({ sources, ownReporting, className }: SourcesListProps) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-3", className)}>
      <h2 id={id} className="type-section text-strong">
        {ARTICLE.sourcesTitle}
      </h2>
      {sources.length === 0 ? (
        <p className="type-body text-body">{ARTICLE.ownReporting}</p>
      ) : (
        <>
          <p className="type-meta text-meta">{ARTICLE.sourcesIntro}</p>
          <ol className="flex flex-col">
            {sources.map((s) => (
              <li
                key={s.url}
                className="flex flex-col gap-1 border-t border-line-subtle py-3 last:border-b"
              >
                <p className="type-meta text-meta">
                  <span className="font-bold text-strong">{s.name}</span>
                  {" · "}
                  {ARTICLE.role[s.role]}
                  {" · "}
                  <span className={s.confirmed ? "text-service" : "text-warn"}>
                    {s.confirmed ? ARTICLE.confirmed : ARTICLE.unconfirmed}
                  </span>
                  {s.publishedAt && (
                    <>
                      {" · "}
                      <time dateTime={s.publishedAt}>{formatDateTime(s.publishedAt)}</time>
                    </>
                  )}
                </p>
                <a
                  href={s.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-tap items-center gap-1.5 self-start type-body font-semibold text-link underline underline-offset-4 hover:text-strong"
                >
                  {s.title || ARTICLE.openSource(s.name)}
                  <Icon name="external-link" size={16} className="shrink-0" />
                  <span className="sr-only">
                    {" "}
                    ({ARTICLE.openSource(s.name)}, {ARTICLE.newTab})
                  </span>
                </a>
              </li>
            ))}
          </ol>
        </>
      )}
      {ownReporting && sources.length > 0 && (
        <p className="type-meta text-meta">{ARTICLE.ownReporting}</p>
      )}
    </section>
  );
}
