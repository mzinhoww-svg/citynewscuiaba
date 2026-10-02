import { Fragment, type CSSProperties, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface MetaRowProps {
  author?: string;
  /** URL do avatar; `null` mostra o círculo vazio. */
  avatar?: string | null;
  time?: string;
  /** Número de fontes da matéria (R8): "3 fontes". */
  sources?: number;
  /** Tempo de leitura em minutos: "4 min de leitura". */
  readMinutes?: number;
  category?: string;
  trending?: string;
  onMore?: () => void;
  inverse?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Linha de metadados sob a manchete. Em cards pequenos, 2 ou 3 itens no máximo.
 *
 * ```tsx
 * <MetaRow author="Ana Lima" sources={3} time="há 12 min" onMore={open} />
 * <MetaRow category="Cidade" trending="Mais lida" readMinutes={4} />
 * ```
 * - Nunca mostra contagem de curtidas ou comentários (R8). Separador `·`.
 */
export function MetaRow({
  author,
  avatar,
  time,
  sources,
  readMinutes,
  category,
  trending,
  onMore,
  inverse = false,
  className,
  style,
}: MetaRowProps) {
  const items: ReactNode[] = [];
  if (category) items.push(<span key="cat">{category}</span>);
  if (author)
    items.push(
      <span key="author" className="inline-flex min-w-0 items-center gap-1.5">
        {avatar !== undefined && (
          <span
            aria-hidden="true"
            className="size-5 shrink-0 rounded-pill bg-nevoa-2 bg-cover bg-center"
            style={avatar ? { backgroundImage: `url(${JSON.stringify(avatar)})` } : undefined}
          />
        )}
        <span className="truncate">{author}</span>
      </span>,
    );
  if (trending)
    items.push(
      <span key="trend" className={cx("inline-flex items-center gap-1", !inverse && "text-link")}>
        <Icon name="flame" size={14} />
        {trending}
      </span>,
    );
  if (sources !== undefined) items.push(<span key="src">{UI.sourcesCount(sources)}</span>);
  if (readMinutes !== undefined) items.push(<span key="read">{UI.readMinutes(readMinutes)}</span>);
  if (time)
    items.push(
      <span key="time" className="tabular-nums">
        {time}
      </span>,
    );

  return (
    <div
      className={cx(
        "flex min-w-0 items-center gap-1.5 type-meta",
        inverse ? "text-branco" : "text-meta",
        className,
      )}
      style={style}
    >
      {items.map((item, i) => (
        <Fragment key={i}>
          {i > 0 && <span aria-hidden="true">·</span>}
          {item}
        </Fragment>
      ))}
      {onMore && (
        <button
          type="button"
          aria-label={UI.more}
          onClick={onMore}
          className="relative ml-auto flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill hover:bg-section"
        >
          <Icon name="ellipsis" size={20} />
        </button>
      )}
    </div>
  );
}
