import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { FocusLoadMoreTarget } from "./LoadMoreFocus";

export interface LoadMoreProps {
  /** Próxima página (com cursor e a âncora do primeiro item novo); `null` = acabou a lista. */
  href: string | null;
  /** Itens mostrados na tela agora. */
  shown: number;
  /** Total real da lista com os filtros atuais. */
  total: number;
  /** Texto do link (ex.: "Carregar mais"). */
  label: string;
  className?: string;
}

/** Id do primeiro item novo depois de "Carregar mais" (`#mais-<n>`, n = itens antes dele). */
export function loadMoreAnchor(shownBefore: number): string {
  return `mais-${shownBefore}`;
}

/**
 * Rodapé de lista que não corta em silêncio: "Mostrando N de TOTAL" e um link comum
 * "Carregar mais" (funciona sem JavaScript). O link aponta para `#mais-<n>`, e o primeiro item
 * novo (com esse id e `tabIndex={-1}`) recebe o foco ao abrir a página.
 *
 * ```tsx
 * <LoadMore href={next ? `/agenda?cursor=${next}#${loadMoreAnchor(rows.length)}` : null}
 *   shown={rows.length} total={total} label="Carregar mais" />
 * ```
 */
export function LoadMore({ href, shown, total, label, className }: LoadMoreProps) {
  return (
    <div className={cx("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <p className="type-meta text-meta">{UI.showing(shown, total)}</p>
      {href && (
        <a
          href={href}
          className={cx(
            "inline-flex h-tap items-center justify-center whitespace-nowrap rounded-pill px-5 text-16 font-semibold leading-none",
            "border border-line-control bg-card-white text-strong hover:bg-section",
            "transition-colors duration-(--dur-fast) ease-(--ease-standard)",
          )}
        >
          {label}
        </a>
      )}
      <FocusLoadMoreTarget />
    </div>
  );
}
