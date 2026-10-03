import Link from "next/link";
import type { TopicView } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";
import { ConfidenceMeter } from "./ConfidenceMeter";
import { TopicStatus } from "./TopicStatus";

export interface TopicSummaryCardProps {
  topic: TopicView;
  as?: "h2" | "h3";
  now?: Date;
  className?: string;
}

/**
 * Assunto em destaque (P01, P06): situação, título, resumo, confiança do conjunto e
 * contagem de matérias e fontes. Não confundir com `TopicCard` (seguir tema, do kit).
 *
 * ```tsx
 * <TopicSummaryCard topic={topic} />
 * ```
 */
export function TopicSummaryCard({
  topic,
  as: Heading = "h3",
  now,
  className,
}: TopicSummaryCardProps) {
  return (
    <article
      className={cx(
        "relative flex flex-col gap-3 border-t-2 border-line-strong pt-4 [--card-radius:var(--r-0)]",
        className,
      )}
    >
      <TopicStatus state={topic.state} className="self-start" />
      <Heading className="type-headline text-strong">
        <Link href={topic.href} className="card-link no-underline">
          {topic.title}
        </Link>
      </Heading>
      {topic.summary && (
        <p className="line-clamp-2 sm:line-clamp-3 type-body text-body">{topic.summary}</p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1">
        <ConfidenceMeter level={topic.confidence.level} />
        <p className="type-meta text-meta">
          {CARD.topicCounts(topic.articleCount, topic.sourceCount)} ·{" "}
          {CARD.updated(formatWhen(topic.updatedAt, now))}
        </p>
      </div>
    </article>
  );
}
