import Link from "next/link";
import type { CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { CategoryTag } from "./CategoryTag";
import { MetaRow } from "./MetaRow";
import { Photo } from "./Photo";

export interface StoryCardProps {
  /** Destino obrigatório: o título é o link (R7). */
  href: string;
  title: string;
  image?: string;
  imageAlt?: string;
  category?: string;
  author?: string;
  avatar?: string | null;
  time?: string;
  sources?: number;
  /** Com `saved` definido, mostra o botão Salvar. */
  saved?: boolean;
  onToggleSave?: () => void;
  width?: number | string;
  as?: "h2" | "h3";
  className?: string;
  style?: CSSProperties;
}

/**
 * Card vertical para carrosséis de Favoritos, "Favoritas da semana" e páginas de autor: foto
 * (pílula de editoria e Salvar) sobre manchete serifada e autoria.
 *
 * ```tsx
 * <StoryCard href="/materia/plano-diretor" category="Política" saved title="Câmara aprova novo plano diretor de Cuiabá" author="Rafael Souza" avatar={null} time="5 h" />
 * ```
 * - Salvar é botão alternável (`aria-pressed`) que fica acima da área clicável do card.
 */
export function StoryCard({
  href,
  title,
  image,
  imageAlt,
  category,
  author,
  avatar,
  time,
  sources,
  saved,
  onToggleSave,
  width = 278,
  as: Heading = "h3",
  className,
  style,
}: StoryCardProps) {
  return (
    <article
      className={cx(
        "relative flex shrink-0 flex-col gap-3.5 rounded-xl bg-card p-3.5 [--card-radius:var(--r-xl)]",
        "transition-colors duration-(--dur-base) ease-(--ease-standard) hover:bg-hover",
        className,
      )}
      style={{ width, ...style }}
    >
      <Photo src={image} alt={imageAlt} radius="lg" height={150} sizes="18em">
        {category && (
          <span className="absolute top-3 left-3">
            <CategoryTag variant="pill">{category}</CategoryTag>
          </span>
        )}
      </Photo>
      <Heading className="line-clamp-2 font-serif text-18 font-semibold leading-snug text-strong">
        <Link href={href} className="card-link no-underline">
          {title}
        </Link>
      </Heading>
      <MetaRow author={author} avatar={avatar} sources={sources} time={time} />
      {saved !== undefined && (
        <button
          type="button"
          aria-label={UI.save}
          aria-pressed={saved}
          onClick={onToggleSave}
          className="absolute top-5 right-5 flex size-tap cursor-pointer items-center justify-center rounded-pill bg-tinta/60 text-branco hover:bg-tinta/80"
        >
          <Icon name="bookmark" fill={saved ? "currentColor" : "none"} />
        </button>
      )}
    </article>
  );
}
