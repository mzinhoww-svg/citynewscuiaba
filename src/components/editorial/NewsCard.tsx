import Link from "next/link";
import type { CSSProperties } from "react";
import { cx } from "../cx";
import { CategoryTag } from "./CategoryTag";
import { MetaRow } from "./MetaRow";
import { Photo } from "./Photo";

export interface NewsCardProps {
  /** Destino obrigatório: o título é o link (R7). */
  href: string;
  title: string;
  image?: string;
  imageAlt?: string;
  category?: string;
  author?: string;
  sources?: number;
  readMinutes?: number;
  time?: string;
  onMore?: () => void;
  /** nevoa = card Névoa (R1, era Papel) · white = branco com hairline, sobre seção Névoa */
  surface?: "nevoa" | "white";
  /** Nível do título (padrão h3). */
  as?: "h2" | "h3" | "h4";
  className?: string;
  style?: CSSProperties;
}

/**
 * Item padrão de feed em "Explorar", "Mais lidas", listas salvas e páginas de autor: miniatura
 * de 96 px, manchete serifada (até 3 linhas) e linha de metadados, em card r20.
 *
 * ```tsx
 * <NewsCard href="/materia/obras-cpa" title="Obras na Av. do CPA mudam o trânsito a partir de segunda" author="Ana Lima" sources={3} time="há 12 min" />
 * ```
 * - `surface="white"` (hairline) quando a seção já é Névoa.
 * - O card inteiro é clicável pelo pseudo-elemento do link; "mais opções" fica acima dele.
 */
export function NewsCard({
  href,
  title,
  image,
  imageAlt,
  category,
  author,
  sources,
  readMinutes,
  time,
  onMore,
  surface = "nevoa",
  as: Heading = "h3",
  className,
  style,
}: NewsCardProps) {
  return (
    <article
      className={cx(
        "relative flex gap-3.5 rounded-xl p-3 [--card-radius:var(--r-xl)]",
        surface === "nevoa" ? "bg-card" : "border border-line-subtle bg-card-white",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-hover",
        className,
      )}
      style={style}
    >
      <Photo src={image} alt={imageAlt} radius="md" sizes="6em" className="size-24" />
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 pt-0.5">
        {category && <CategoryTag>{category}</CategoryTag>}
        <Heading
          className={cx("type-headline-sm text-strong", category ? "line-clamp-2" : "line-clamp-3")}
        >
          <Link href={href} className="card-link no-underline">
            {title}
          </Link>
        </Heading>
        <MetaRow
          author={author}
          sources={sources}
          readMinutes={readMinutes}
          time={time}
          onMore={onMore}
        />
      </div>
    </article>
  );
}
