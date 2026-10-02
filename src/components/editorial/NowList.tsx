import Link from "next/link";
import { useId } from "react";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { formatHour, formatWhen, nextCycleMinutes } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { cx } from "../cx";
import { LiveIndicator } from "./LiveIndicator";
import { OriginLabel } from "./OriginLabel";

export interface NowListProps {
  items: ArticleSummary[];
  now?: Date;
  className?: string;
}

const MAX_ITEMS = 6;

/**
 * "Agora": as últimas matérias com horário, modo de publicação e a contagem até o próximo
 * ciclo do motor (a cada 30 min). Região `aria-live="polite"` (DESIGN.md §9).
 *
 * ```tsx
 * <NowList items={home.now} />
 * ```
 */
export function NowList({ items, now, className }: NowListProps) {
  const id = useId();
  const reference = now ?? new Date();
  return (
    <section aria-labelledby={id} className={cx("flex flex-col", className)}>
      <h2 id={id} className="border-b border-line-strong pb-3">
        <LiveIndicator label={CARD.now} />
      </h2>
      <ol aria-live="polite" className="flex flex-col">
        {items.slice(0, MAX_ITEMS).map((a) => {
          const mode = [...a.labels.shown, ...a.labels.hidden].find(
            (l) => l.kind === "auto_published" || l.kind === "human_reviewed",
          );
          return (
            <li
              key={a.id}
              className="relative flex flex-col gap-1.5 border-b border-line-subtle py-3 [--card-radius:var(--r-0)]"
            >
              <p className="type-meta text-meta">
                <time dateTime={a.publishedAt} className="font-bold tabular-nums text-strong">
                  {formatHour(a.publishedAt)}
                </time>
                <span aria-hidden="true"> · </span>
                <span>{formatWhen(a.publishedAt, reference)}</span>
              </p>
              <h3 className="type-headline-sm text-strong">
                <Link href={a.href} className="card-link no-underline">
                  {a.title}
                </Link>
              </h3>
              {mode && (
                <div className="relative">
                  <OriginLabel label={{ kind: mode.kind, text: mode.text }} />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      <p className="pt-3 type-meta text-meta">{CARD.nextCycle(nextCycleMinutes(reference))}</p>
    </section>
  );
}
