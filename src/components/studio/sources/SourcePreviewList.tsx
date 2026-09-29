import { fullDateTime } from "@/content/pt-BR/sources-admin";
import { WIZARD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import type { SourcePreviewItem } from "@/lib/sources/types";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface SourcePreviewListProps {
  items: readonly SourcePreviewItem[];
  /** Nível do título da seção. */
  headingLevel?: "h2" | "h3";
  className?: string;
}

const isWebUrl = (url: string) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
};

/**
 * Prévia dos últimos itens de uma fonte (spec §7.1.4): só título, data e link para o original, em
 * texto. Nenhuma imagem de terceiro, nada do corpo, links externos com `rel="noopener noreferrer"`.
 *
 * ```tsx
 * <SourcePreviewList items={analysis.preview.items} />
 * ```
 */
export function SourcePreviewList({
  items,
  headingLevel = "h2",
  className,
}: SourcePreviewListProps) {
  const Heading = headingLevel;
  const headingId = "previa-itens";
  return (
    <section aria-labelledby={headingId} className={cx("flex flex-col gap-2", className)}>
      <Heading id={headingId} className="type-section text-strong">
        {WIZARD_TEXT.preview.title}
      </Heading>
      <p className="type-meta text-meta">{WIZARD_TEXT.preview.hint}</p>
      {items.length === 0 ? (
        <p className="type-body text-meta">{WIZARD_TEXT.preview.empty}</p>
      ) : (
        <ol aria-label={WIZARD_TEXT.preview.title} className="flex flex-col">
          {items.map((item, i) => (
            <li
              key={`${item.url}-${i}`}
              className="flex flex-col gap-1 border-t border-line-section py-2.5 sm:flex-row sm:gap-3"
            >
              <span
                className={cx(
                  "shrink-0 type-meta whitespace-nowrap sm:w-28",
                  item.publishedAt ? "text-meta" : "text-warn",
                )}
              >
                {item.publishedAt ? fullDateTime(item.publishedAt) : WIZARD_TEXT.preview.noDate}
              </span>
              {isWebUrl(item.url) ? (
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-w-0 type-body break-words text-link underline-offset-4 hover:underline"
                >
                  {item.title}
                  <Icon name="external-link" size={14} className="ml-1 inline align-baseline" />
                  <span className="sr-only"> {WIZARD_TEXT.preview.opensNewTab}</span>
                </a>
              ) : (
                <span className="min-w-0 type-body break-words text-strong">{item.title}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
