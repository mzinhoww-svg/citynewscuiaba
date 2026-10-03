import Link from "next/link";
import type { CSSProperties } from "react";
import { TICKER_TEXT } from "@/content/pt-BR/ticker";
import type { TickerItem } from "@/lib/ticker";
import { cx } from "../cx";

export interface NewsTickerProps {
  items: readonly TickerItem[];
  className?: string;
}

/** Segundos de rolagem por manchete: o ritmo de leitura não muda com a quantidade de itens. */
const SECONDS_PER_ITEM = 7;

const linkClass =
  "block whitespace-nowrap px-4 py-2.5 text-12 font-semibold uppercase tracking-wide text-on-inverse no-underline hover:underline focus-visible:underline";

/**
 * Faixa "Última hora" logo abaixo do menu: manchetes em caixa alta rolando para a esquerda,
 * regionais primeiro. Rolagem só em CSS; pausa ao passar o mouse, tocar ou focar um link, para
 * dar tempo de clicar. Com `prefers-reduced-motion` não rola: vira lista com rolagem manual.
 * A cópia usada no laço é `aria-hidden` e não entra na ordem de tabulação.
 * Sem itens, não renderiza.
 */
export function NewsTicker({ items, className }: NewsTickerProps) {
  if (items.length === 0) return null;
  const style = { "--ticker-duration": `${items.length * SECONDS_PER_ITEM}s` } as CSSProperties;
  return (
    <section
      aria-label={TICKER_TEXT.region}
      data-ticker="news"
      className={cx("bg-inverse text-on-inverse", className)}
    >
      <div className="mx-auto flex max-w-page items-stretch">
        <p className="flex shrink-0 items-center bg-link px-3 text-12 font-bold uppercase tracking-wide text-on-inverse lg:px-4">
          {TICKER_TEXT.label}
        </p>
        <div
          className={cx(
            "group/ticker min-w-0 flex-1 overflow-hidden",
            "motion-reduce:overflow-x-auto motion-reduce:scrollbar-none",
          )}
        >
          <ul
            style={style}
            className={cx(
              "flex w-max items-center",
              "motion-safe:animate-ticker motion-safe:group-hover/ticker:[animation-play-state:paused]",
              "motion-safe:group-focus-within/ticker:[animation-play-state:paused] motion-safe:group-active/ticker:[animation-play-state:paused]",
            )}
          >
            {items.map((it, i) => (
              <li key={`a-${i}`} className="flex items-center">
                <Link href={it.href} className={linkClass}>
                  {it.title}
                </Link>
                <span aria-hidden="true" className="text-12 text-on-inverse opacity-60">
                  /
                </span>
              </li>
            ))}
            {items.map((it, i) => (
              <li
                key={`b-${i}`}
                aria-hidden="true"
                className="flex items-center motion-reduce:hidden"
              >
                <Link href={it.href} tabIndex={-1} className={linkClass}>
                  {it.title}
                </Link>
                <span aria-hidden="true" className="text-12 text-on-inverse opacity-60">
                  /
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
