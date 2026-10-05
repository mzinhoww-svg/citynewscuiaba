import { cx } from "../../cx";
import { Icon, type IconName } from "../../ui/Icon";

export interface BenefitItem {
  /** Título curto do item (vira h3); sem ele, o item é só texto. */
  title?: string;
  text: string;
  icon?: IconName;
}

export interface BenefitsProps {
  id: string;
  title: string;
  intro?: string;
  items: readonly BenefitItem[];
  className?: string;
}

/**
 * Grade de benefícios (UI-T11, adaptada do feature grid do TripleD): h2 e itens com ícone,
 * título e texto. Sem cartões: cada item é separado por uma régua no topo, para não parecer
 * clicável (CLAUDE.md §7: nada de card sem link).
 *
 * ```tsx
 * <Benefits id="app-porque" title="O que muda" items={[{ icon: "wifi-off", text: "…" }]} />
 * ```
 */
export function Benefits({ id, title, intro, items, className }: BenefitsProps) {
  return (
    <section aria-labelledby={id} className={cx("flex flex-col gap-6", className)}>
      <div className="flex max-w-read flex-col gap-2">
        <h2 id={id} className="type-section text-strong">
          {title}
        </h2>
        {intro && <p className="type-body text-body">{intro}</p>}
      </div>
      <ul className="grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <li key={it.text} className="flex gap-3 border-t-2 border-line-strong pt-4">
            {it.icon && (
              <span className="mt-0.5 shrink-0 text-strong">
                <Icon name={it.icon} size={20} />
              </span>
            )}
            <div className="flex flex-col gap-1">
              {it.title && <h3 className="type-headline-sm text-strong">{it.title}</h3>}
              <p className="type-body text-pretty text-body">{it.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
