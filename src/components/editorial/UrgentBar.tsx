import Link from "next/link";
import { useId } from "react";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { HOME } from "@/content/pt-BR/portal";
import { cx } from "../cx";

export interface UrgentBarProps {
  article: ArticleSummary;
  now?: Date;
  className?: string;
}

/**
 * Faixa URGENTE (R14: texto Tinta sobre Urgente, 5,05:1). Só aparece com urgente publicado
 * por humano; sem urgente, a página não renderiza a faixa.
 *
 * ```tsx
 * {home.urgent && <UrgentBar article={home.urgent} />}
 * ```
 */
export function UrgentBar({ article, now, className }: UrgentBarProps) {
  const id = useId();
  return (
    <div
      role="alert"
      aria-labelledby={id}
      className={cx("relative bg-urgente text-tinta [--card-radius:var(--r-0)]", className)}
    >
      <div className="mx-auto flex max-w-page flex-wrap items-baseline gap-x-3 gap-y-1 px-gutter py-3">
        <span id={id} className="type-eyebrow">
          {HOME.urgent}
        </span>
        <Link
          href={article.href}
          className="card-link font-serif text-18 font-semibold leading-snug text-tinta underline-offset-4 hover:underline"
        >
          {article.title}
        </Link>
        <span className="type-meta tabular-nums">{formatWhen(article.publishedAt, now)}</span>
      </div>
    </div>
  );
}
