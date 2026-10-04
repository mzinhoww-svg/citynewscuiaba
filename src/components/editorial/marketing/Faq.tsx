import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

export interface FaqItem {
  question: string;
  answer: string;
}

export interface FaqProps {
  id: string;
  title: string;
  items: readonly FaqItem[];
  className?: string;
}

/**
 * Perguntas frequentes (UI-T11, adaptado do FAQ do TripleD) com `<details>`/`<summary>` nativos:
 * funcionam sem JavaScript, por teclado e com leitor de tela. A seta só gira com `motion-safe`.
 *
 * ```tsx
 * <Faq id="nl-faq" title="Perguntas frequentes" items={[{ question: "…", answer: "…" }]} />
 * ```
 */
export function Faq({ id, title, items, className }: FaqProps) {
  return (
    <section aria-labelledby={id} className={cx("flex max-w-read flex-col gap-4", className)}>
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      <div className="flex flex-col border-b border-line-subtle">
        {items.map((it) => (
          <details key={it.question} className="group border-t border-line-subtle">
            <summary className="flex min-h-tap cursor-pointer list-none items-center justify-between gap-3 py-3 type-body font-semibold text-strong [&::-webkit-details-marker]:hidden">
              {it.question}
              <Icon
                name="chevron-down"
                size={20}
                className="shrink-0 group-open:rotate-180 motion-safe:transition-transform"
              />
            </summary>
            <p className="pb-4 type-body text-pretty text-body">{it.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
