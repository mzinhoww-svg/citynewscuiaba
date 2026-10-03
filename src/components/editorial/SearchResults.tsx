import Link from "next/link";
import { useId } from "react";
import { LABEL_TEXT } from "@/content/pt-BR/labels";
import { CARD } from "@/content/pt-BR/portal-card";
import { SEARCH } from "@/content/pt-BR/search";
import { formatDateTime, formatWhen } from "@/lib/format/date";
import { plaqueOf, publicLabels } from "@/lib/labels";
import type { SearchGroup, SearchHit } from "@/lib/search/types";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { ArticleThumb } from "./ArticleCard";
import { Highlight } from "./Highlight";
import { OriginLabel } from "./OriginLabel";
import { TopicStatus } from "./TopicStatus";

export interface SearchResultItemProps {
  hit: SearchHit;
  /** Termos da consulta já sem acento (`queryTerms`). */
  terms: string[];
  now?: Date;
  className?: string;
}

const ROW = "relative flex flex-col gap-2 py-4";
const TITLE = "type-headline-sm text-strong";

/**
 * Um resultado da busca (P12) com termos destacados e origem visível: matéria (rótulos), item de
 * outro veículo (AGREGADO, link para o original em nova aba), evento ou assunto. Linha de lista,
 * nunca card dentro de card.
 *
 * ```tsx
 * <SearchResultItem hit={hit} terms={queryTerms(q)} />
 * ```
 */
export function SearchResultItem({ hit, terms, now, className }: SearchResultItemProps) {
  switch (hit.kind) {
    case "article": {
      const a = hit.item;
      const pub = publicLabels(a);
      return (
        <article className={cx("relative flex items-start gap-4 py-4", className)}>
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {pub.plaque === "original" && (
              <div className="relative flex">
                <OriginLabel label={{ kind: "original", text: LABEL_TEXT.original }} />
              </div>
            )}
            <h3 className={TITLE}>
              <Link href={a.href} className="card-link no-underline hover:underline">
                <Highlight text={a.title} terms={terms} />
              </Link>
            </h3>
            <p className="line-clamp-2 type-body text-body">
              <Highlight text={a.dek} terms={terms} />
            </p>
            <p className="flex flex-wrap gap-x-1.5 type-meta text-meta">
              <span>{a.section.name}</span>
              {pub.originText && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{pub.originText}</span>
                </>
              )}
              {pub.reviewText && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{pub.reviewText}</span>
                </>
              )}
              <span aria-hidden="true">·</span>
              <time dateTime={a.publishedAt} className="tabular-nums">
                {formatWhen(a.publishedAt, now)}
              </time>
            </p>
          </div>
          <ArticleThumb article={a} />
        </article>
      );
    }
    case "aggregated": {
      const g = hit.item;
      const label = plaqueOf(g.labels);
      return (
        <article className={cx(ROW, className)}>
          {label && (
            <div className="relative">
              <OriginLabel label={label} />
            </div>
          )}
          <h3 className={TITLE}>
            <a
              href={g.url}
              target="_blank"
              rel="noopener noreferrer"
              className="card-link no-underline hover:underline"
            >
              <Highlight text={g.title} terms={terms} />
              <span className="sr-only">
                {". "}
                {CARD.openIn(g.sourceName)}, {CARD.newTab}
              </span>
            </a>
          </h3>
          {g.summary && (
            <p className="line-clamp-2 type-body text-body">
              <Highlight text={g.summary} terms={terms} />
            </p>
          )}
          <p className="flex flex-wrap items-center gap-x-1.5 type-meta text-meta">
            {g.publishedAt && (
              <>
                <time dateTime={g.publishedAt} className="tabular-nums">
                  {formatWhen(g.publishedAt, now)}
                </time>
                <span aria-hidden="true">·</span>
              </>
            )}
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-1 font-semibold text-link"
            >
              {CARD.openIn(g.sourceName)}
              <Icon name="external-link" size={14} />
            </span>
          </p>
        </article>
      );
    }
    case "event": {
      const e = hit.item;
      return (
        <article className={cx(ROW, className)}>
          <p className="type-eyebrow text-eyebrow">{SEARCH.eventEyebrow}</p>
          <h3 className={TITLE}>
            <Link href={e.href} className="card-link no-underline hover:underline">
              <Highlight text={e.title} terms={terms} />
            </Link>
          </h3>
          <p className="flex flex-wrap gap-x-1.5 type-meta text-meta">
            <time dateTime={e.startsAt} className="tabular-nums">
              {formatDateTime(e.startsAt)}
            </time>
            <span aria-hidden="true">·</span>
            <span>
              <Highlight text={e.venue} terms={terms} />
            </span>
          </p>
        </article>
      );
    }
    case "topic": {
      const t = hit.item;
      return (
        <article className={cx(ROW, className)}>
          <div className="relative flex flex-wrap items-center gap-2">
            <span className="type-eyebrow text-eyebrow">{SEARCH.topicEyebrow}</span>
            <TopicStatus state={t.state} />
          </div>
          <h3 className={TITLE}>
            <Link href={t.href} className="card-link no-underline hover:underline">
              <Highlight text={t.title} terms={terms} />
            </Link>
          </h3>
          {t.summary && (
            <p className="line-clamp-2 type-body text-body">
              <Highlight text={t.summary} terms={terms} />
            </p>
          )}
          <p className="type-meta text-meta">{CARD.topicCounts(t.articleCount, t.sourceCount)}</p>
        </article>
      );
    }
  }
}

export interface SearchGroupBlockProps {
  group: SearchGroup;
  terms: string[];
  now?: Date;
}

/**
 * Grupo de resultados do mesmo assunto (2+ itens, P12): cabeçalho com o assunto e a lista dos
 * itens. Sem assunto, o único item aparece sozinho.
 */
export function SearchGroupBlock({ group, terms, now }: SearchGroupBlockProps) {
  const id = useId();
  const { topic } = group;
  if (!topic) {
    const hit = group.items[0];
    return hit ? <SearchResultItem hit={hit} terms={terms} now={now} /> : null;
  }
  return (
    <section
      aria-labelledby={id}
      className="my-3 flex flex-col border-l-2 border-line-strong bg-section px-4 pt-4 sm:px-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="type-eyebrow text-eyebrow">{SEARCH.topicEyebrow}</span>
        <TopicStatus state={topic.state} />
      </div>
      <h3 id={id} className="mt-2 type-headline text-strong">
        <Link href={topic.href} className="no-underline hover:underline">
          <Highlight text={topic.title} terms={terms} />
        </Link>
      </h3>
      <p className="mt-1 type-meta text-meta">
        {CARD.topicCounts(topic.articleCount, topic.sourceCount)}
      </p>
      <ul className="mt-2 flex flex-col divide-y divide-line-section border-t border-line-section">
        {group.items.map((hit) => (
          <li key={`${hit.kind}:${hit.item.id}`}>
            <SearchResultItem hit={hit} terms={terms} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}
