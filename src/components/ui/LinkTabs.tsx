"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cx } from "../cx";

export interface LinkTabItem {
  href: string;
  label: string;
  /** Contagem mostrada em texto ao lado do rótulo (zero também aparece). */
  count?: number;
  /** Aba da rota atual. */
  current?: boolean;
}

export interface LinkTabsProps {
  /** Nome da navegação (ex.: "Abas da fila"). */
  label: string;
  items: readonly LinkTabItem[];
  className?: string;
}

type Fade = "none" | "start" | "end" | "both";

/**
 * Abas por rota (item 33, D-09): cada aba é um link para outra URL (`?aba=`, subpágina), não um
 * painel na mesma tela; para isso use `Tabs`. Funciona sem JavaScript.
 *
 * ```tsx
 * <LinkTabs
 *   label="Abas da fila"
 *   items={[
 *     { href: "/estudio/fila?aba=todas", label: "Todas", count: 12, current: true },
 *     { href: "/estudio/fila?aba=minhas", label: "Minhas", count: 3 },
 *   ]}
 * />
 * ```
 * - `nav` com `aria-current="page"` na aba atual; ativa = Tinta com texto branco e peso maior.
 * - Rolagem horizontal no celular; `data-fade` + `scroll-fade` apagam a borda que ainda tem
 *   abas, e a aba atual entra na área visível ao carregar.
 * - Alvo de toque de 44 px.
 */
export function LinkTabs({ label, items, className }: LinkTabsProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState<Fade>("none");

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setFade(start && end ? "both" : start ? "start" : end ? "end" : "none");
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, []);

  const currentHref = items.find((it) => it.current)?.href;
  useEffect(() => {
    // Só a rolagem horizontal da lista: `scrollIntoView` também rolaria a página.
    const el = listRef.current;
    const target = el?.querySelector<HTMLElement>('[aria-current="page"]')?.parentElement;
    if (!el || !target) return;
    const left = target.offsetLeft; // a lista é `relative`: deslocamento medido a partir dela
    const right = left + target.offsetWidth;
    if (left < el.scrollLeft || right > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = Math.max(0, left - (el.clientWidth - target.offsetWidth) / 2);
    }
  }, [currentHref]);

  return (
    <nav aria-label={label} className={className}>
      <ul
        ref={listRef}
        data-fade={fade}
        className="relative flex snap-x gap-2 overflow-x-auto pb-1 scrollbar-none scroll-fade"
      >
        {items.map((it) => (
          <li key={it.href} className="shrink-0 snap-start">
            <Link
              href={it.href}
              aria-current={it.current ? "page" : undefined}
              className={cx(
                "inline-flex min-h-tap items-center gap-2 whitespace-nowrap rounded-pill px-4 text-14 leading-none no-underline",
                "transition-colors duration-(--dur-base) ease-(--ease-standard)",
                it.current
                  ? "bg-action-primary font-semibold text-on-inverse"
                  : "bg-section font-medium text-meta hover:bg-hover hover:text-strong",
              )}
            >
              <span>{it.label}</span>
              {it.count !== undefined ? <span className="tabular-nums">{it.count}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
