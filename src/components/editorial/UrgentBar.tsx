import Link from "next/link";
import { useId } from "react";
import type { ArticleSummary } from "@/lib/db/queries/types";
import { formatWhen } from "@/lib/format/date";
import { HOME } from "@/content/pt-BR/portal-home";
import { cx } from "../cx";

export interface UrgentBarProps {
  article: ArticleSummary;
  now?: Date;
  className?: string;
}

/**
 * Faixa URGENTE (R14: texto Tinta sobre Urgente, 5,05:1), linha fina: eyebrow, título e hora correm no mesmo parágrafo. Só aparece com urgente publicado
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
      <p className="mx-auto max-w-page px-gutter py-2 leading-snug">
        <span id={id} className="type-eyebrow mr-2 align-baseline">
          {HOME.urgent}
        </span>
        <Link
          href={article.href}
          className="card-link font-serif text-16 font-semibold text-tinta underline-offset-4 hover:underline sm:text-18"
        >
          {article.title}
        </Link>
        <span className="type-meta ml-2 whitespace-nowrap tabular-nums">
          {formatWhen(article.publishedAt, now)}
        </span>
      </p>
    </div>
  );
}
