import Link from "next/link";
import { useId } from "react";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { formatHour, formatWhen, nextCycleMinutes } from "@/lib/format/date";
import { CARD } from "@/content/pt-BR/portal-card";
import { HOME } from "@/content/pt-BR/portal-home";
import { publicLabels } from "@/lib/labels";
import { cx } from "../cx";
import { LiveIndicator } from "./LiveIndicator";

export interface NowListProps {
  items: ArticleSummary[];
  now?: Date;
  className?: string;
}

const MAX_ITEMS = 6;

/**
 * "Agora": as últimas matérias com horário, modo de publicação e a contagem até o próximo
 * ciclo do motor (a cada 30 min). Sem `aria-live`: a lista é estática no carregamento e não
 * deve ser anunciada sozinha.
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
      {items.length === 0 ? (
        <p className="py-3 type-body text-body">{HOME.nowEmpty}</p>
      ) : (
        <ol className="flex flex-col">
          {items.slice(0, MAX_ITEMS).map((a) => {
            const { originText } = publicLabels(a);
            return (
              <li
                key={a.id}
                className="relative flex flex-col gap-1.5 border-b border-line-subtle py-2 [--card-radius:var(--r-0)]"
              >
                <p className="type-meta text-meta">
                  <time dateTime={a.publishedAt} className="font-bold tabular-nums text-strong">
                    {formatHour(a.publishedAt)}
                  </time>
                  {/* No celular a data relativa some: sem origem, o separador ficaria solto. */}
                  <span aria-hidden="true" className={originText ? undefined : "max-sm:hidden"}>
                    {" · "}
                  </span>
                  <span className="max-sm:hidden">{formatWhen(a.publishedAt, reference)}</span>
                  {/* Celular: a origem vai na linha do horário (o horário já está dito). */}
                  {originText && <span className="sm:hidden">{originText}</span>}
                </p>
                <h3 className="type-headline-sm text-strong">
                  <Link href={a.href} className="card-link no-underline">
                    {a.title}
                  </Link>
                </h3>
                {originText && <p className="type-meta text-meta max-sm:hidden">{originText}</p>}
              </li>
            );
          })}
        </ol>
      )}
      <p className={cx("pt-3 type-meta text-meta", items.length > 0 && "hidden lg:block")}>
        {CARD.nextCycle(nextCycleMinutes(reference))}
      </p>
    </section>
  );
}
