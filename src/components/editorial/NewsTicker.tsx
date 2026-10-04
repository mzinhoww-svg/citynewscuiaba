import Link from "next/link";
import { TICKER_TEXT } from "@/content/pt-BR/ticker";
import type { TickerItem } from "@/lib/ticker";
import { cx } from "../cx";

export interface NewsTickerProps {
  items: readonly TickerItem[];
  className?: string;
}

const linkClass =
  "flex min-h-tap items-center whitespace-nowrap px-4 text-14 font-semibold text-on-inverse no-underline hover:underline focus-visible:underline";

/**
 * Faixa "Última hora" logo abaixo do menu: manchetes em caixa de frase, 14 px, regionais
 * primeiro. Nada se move sozinho (UX-W1-T6, DESIGN.md §10): é uma lista com rolagem manual
 * (deslizar no celular, Tab ou trackpad no desktop), com encaixe por manchete.
 * Sem itens, não renderiza.
 */
export function NewsTicker({ items, className }: NewsTickerProps) {
  if (items.length === 0) return null;
  return (
    <section
      aria-label={TICKER_TEXT.region}
      data-ticker="news"
      className={cx("bg-inverse text-on-inverse", className)}
    >
      <div className="mx-auto flex max-w-page items-stretch">
        <p className="flex shrink-0 items-center bg-link px-3 text-14 font-bold text-on-inverse lg:px-4">
          {TICKER_TEXT.label}
        </p>
        <div className="min-w-0 flex-1 snap-x snap-proximity overflow-x-auto overscroll-x-contain scrollbar-none scroll-px-4">
          <ul className="flex w-max items-center">
            {items.map((it, i) => (
              <li key={i} className="flex snap-start items-center">
                <Link href={it.href} className={linkClass}>
                  {it.title}
                </Link>
                {i < items.length - 1 ? (
                  <span aria-hidden="true" className="text-14 text-on-inverse opacity-60">
                    /
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
