import Link from "next/link";
import type { TimelineEntry } from "@/lib/db/queries/types";
import { formatDateTime } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { TOPIC } from "@/content/pt-BR/portal-topic";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface TimelineProps {
  entries: TimelineEntry[];
  /** Nível do título (padrão h2). */
  as?: "h2" | "h3";
  className?: string;
}

/**
 * Linha do tempo do assunto (P05): o que saiu, quando e onde. Itens de outros veículos abrem o
 * original em nova aba e dizem de onde são.
 *
 * ```tsx
 * <Timeline entries={topic.timeline} />
 * ```
 */
export function Timeline({ entries, as: Heading = "h2", className }: TimelineProps) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="linha-do-tempo" className={cx("flex flex-col gap-3", className)}>
      <Heading id="linha-do-tempo" className="type-section text-strong">
        {TOPIC.timeline}
      </Heading>
      <ol className="flex flex-col border-l-2 border-line-section">
        {entries.map((e) => (
          <li key={`${e.kind}-${e.href}`} className="relative flex flex-col gap-0.5 py-2 pl-4">
            <span
              aria-hidden="true"
              className={cx(
                "absolute top-3.5 -left-1.25 size-2 rounded-pill",
                e.kind === "citynews" ? "bg-urucum" : "bg-line-control",
              )}
            />
            <p className="type-meta text-meta">
              <time dateTime={e.at} className="tabular-nums">
                {formatDateTime(e.at)}
              </time>
              {" · "}
              {e.kind === "citynews" ? TOPIC.timelineCityNews : e.sourceName}
            </p>
            {e.kind === "citynews" ? (
              <Link
                href={e.href}
                className="text-16 font-semibold leading-snug text-strong underline-offset-4 hover:underline"
              >
                {e.title}
              </Link>
            ) : (
              <a
                href={e.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-16 leading-snug text-strong underline-offset-4 hover:underline"
              >
                {e.title}
                <Icon name="external-link" size={14} className="ml-1 inline align-baseline" />
                <span className="sr-only">
                  {" "}
                  ({CARD.openIn(e.sourceName)}, {CARD.newTab})
                </span>
              </a>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
