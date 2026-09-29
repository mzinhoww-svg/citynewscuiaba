import { WIZARD as T } from "@/content/pt-BR/sources-admin-detail";
import { formatDateTime } from "@/lib/format/date";
import type { SourcePreview } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface SourcePreviewListProps {
  items: SourcePreview["items"];
  /** Itens descartados por conter instruções (nunca chegam ao modelo nem à tela). */
  dropped?: number;
  className?: string;
}

/**
 * Prévia dos últimos itens da fonte (spec §7.1): só título, data e link para o original, tudo como
 * texto. Nenhuma imagem de terceiro e nada do corpo. Links externos abrem em outra aba com
 * `rel="noopener noreferrer"`.
 */
export function SourcePreviewList({ items, dropped = 0, className }: SourcePreviewListProps) {
  return (
    <div className={cx("flex flex-col gap-3", className)}>
      <p className="type-meta text-meta">{T.previewNote}</p>
      {items.length === 0 ? (
        <p className="type-body text-meta">{T.previewEmpty}</p>
      ) : (
        <ul
          aria-label={T.previewListLabel}
          className="flex flex-col divide-y divide-line-subtle rounded-lg border border-line-subtle bg-card-white"
        >
          {items.map((it, i) => (
            <li key={`${it.url}-${i}`} className="flex flex-col gap-1 px-4 py-3">
              <a
                href={it.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-tap items-center gap-2 type-body font-semibold text-strong underline-offset-4 hover:underline"
              >
                <span>{it.title}</span>
                <Icon name="external-link" size={16} className="shrink-0 text-meta" />
                <span className="sr-only"> (abre em outra aba)</span>
              </a>
              <span className="type-meta text-meta">
                {it.publishedAt ? formatDateTime(it.publishedAt) : "Sem data"}
              </span>
            </li>
          ))}
        </ul>
      )}
      {dropped > 0 && (
        <p className="flex items-start gap-1.5 type-meta text-warn">
          <Icon name="triangle-alert" size={16} className="mt-0.5 shrink-0" />
          {T.dropped(dropped)}
        </p>
      )}
    </div>
  );
}
