"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TICKER_TEXT } from "@/content/pt-BR/ticker";
import type { TickerItem } from "@/lib/ticker";
import { cx } from "../cx";
import { Icon } from "../ui/Icon";
import { useScrollEdges } from "./use-scroll-edges";

export interface NewsTickerProps {
  items: readonly TickerItem[];
  className?: string;
}

const linkClass =
  "flex min-h-tap items-center whitespace-nowrap px-4 text-14 font-semibold text-on-inverse no-underline hover:underline focus-visible:underline";

const navClass =
  "inline-flex size-tap shrink-0 cursor-pointer items-center justify-center text-on-inverse hover:bg-branco/15 aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:bg-transparent";

/** Altura de uma linha na roda do mouse em modo "linhas" (Firefox). */
const LINE_PX = 16;

/**
 * Faixa "Última hora" logo abaixo do menu: manchetes em caixa de frase, 14 px, regionais
 * primeiro. Nada se move sozinho (UX-W1-T6, DESIGN.md §10): é uma lista com rolagem manual
 * (deslizar no celular, Tab ou trackpad), com encaixe por manchete. Como a barra de rolagem não
 * aparece, no desktop a roda do mouse rola a faixa na horizontal (só enquanto houver para onde ir;
 * depois a página rola) e os botões anterior e próximo andam quase uma largura. A suavidade vem
 * do CSS (`motion-safe:scroll-smooth`). Sem itens, não renderiza.
 */
export function NewsTicker({ items, className }: NewsTickerProps) {
  const { ref, scrollable, fade } = useScrollEdges<HTMLDivElement>();
  const atStart = fade === "none" || fade === "end";
  const atEnd = fade === "none" || fade === "start";

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Gesto horizontal (trackpad, Shift+roda) fica com o navegador.
      if (Math.abs(e.deltaX) >= Math.abs(e.deltaY)) return;
      if (el.scrollWidth <= el.clientWidth + 1) return;
      const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? el.clientWidth : 1;
      const delta = e.deltaY * unit;
      const canGo =
        delta > 0 ? el.scrollLeft + el.clientWidth < el.scrollWidth - 1 : el.scrollLeft > 1;
      if (!canGo) return;
      e.preventDefault();
      el.scrollBy({ left: delta, behavior: "instant" });
    };
    // passive: false para poder segurar a rolagem vertical da página enquanto a faixa anda.
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [ref]);

  if (items.length === 0) return null;

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el || (dir > 0 ? atEnd : atStart)) return;
    el.scrollBy({ left: dir * Math.round(el.clientWidth * 0.8) });
  };

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
        <div
          ref={ref}
          className="min-w-0 flex-1 snap-x snap-proximity overflow-x-auto overscroll-x-contain scrollbar-none scroll-px-4 motion-safe:scroll-smooth"
        >
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
        {scrollable && (
          <div className="hidden shrink-0 items-center lg:flex">
            <button
              type="button"
              aria-label={TICKER_TEXT.prev}
              aria-disabled={atStart}
              onClick={() => page(-1)}
              className={navClass}
            >
              <Icon name="chevron-left" size={20} />
            </button>
            <button
              type="button"
              aria-label={TICKER_TEXT.next}
              aria-disabled={atEnd}
              onClick={() => page(1)}
              className={navClass}
            >
              <Icon name="chevron-right" size={20} />
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
