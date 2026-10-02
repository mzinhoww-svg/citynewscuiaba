import { TOPIC } from "@/content/pt-BR/portal-topic";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";

export interface TopicFaqProps {
  items: { q: string; a: string }[];
  className?: string;
}

/**
 * Perguntas frequentes do assunto (P05) em `<details>`: funcionam sem JavaScript e pelo teclado.
 *
 * ```tsx
 * <TopicFaq items={topic.faq} />
 * ```
 */
export function TopicFaq({ items, className }: TopicFaqProps) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="perguntas" className={cx("flex flex-col gap-2", className)}>
      <h2 id="perguntas" className="type-section text-strong">
        {TOPIC.faq}
      </h2>
      <div className="flex flex-col">
        {items.map((f) => (
          <details key={f.q} className="group border-b border-line-subtle">
            <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 py-2 text-16 font-semibold text-strong [&::-webkit-details-marker]:hidden">
              {f.q}
              <Icon
                name="chevron-down"
                size={18}
                className="shrink-0 transition-transform duration-(--dur-fast) group-open:rotate-180"
              />
            </summary>
            <p className="pb-3 type-body text-body">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
