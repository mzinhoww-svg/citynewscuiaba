"use client";

import { Children, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";

export interface RailProps {
  /** Nome da lista, lido por leitores de tela. */
  label: string;
  children: ReactNode;
  /** sm = 14 rem · md = 18 rem (padrão). */
  itemWidth?: "sm" | "md";
  /** No desktop o trilho vira grade sem rolagem (padrão: continua rolando). */
  desktop?: "scroll" | "grid";
  /** Sangra até a borda da tela no celular (padrão). Dentro de uma superfície com padding, false. */
  bleed?: boolean;
  className?: string;
}

const WIDTH = { sm: "w-56", md: "w-72" } as const;

/**
 * Trilho horizontal da home (assuntos, coleções, agenda, serviços): lista nomeada que rola com
 * encaixe obrigatório, sem rolagem automática. Com o foco no trilho, as setas andam um item,
 * Home e End vão às pontas; Tab continua passando pelos links de cada item.
 *
 * ```tsx
 * <Rail label="Coleções" itemWidth="sm">{items}</Rail>
 * ```
 */
export function Rail({
  label,
  children,
  itemWidth = "md",
  desktop = "scroll",
  bleed = true,
  className,
}: RailProps) {
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const behavior = smooth ? "smooth" : "auto";
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      const first = el.firstElementChild as HTMLElement | null;
      const step = (first?.offsetWidth ?? el.clientWidth) + 12;
      e.preventDefault();
      el.scrollBy({ left: e.key === "ArrowRight" ? step : -step, behavior });
    } else if (e.key === "Home") {
      e.preventDefault();
      el.scrollTo({ left: 0, behavior });
    } else if (e.key === "End") {
      e.preventDefault();
      el.scrollTo({ left: el.scrollWidth, behavior });
    }
  };
  return (
    <div
      role="list"
      aria-label={label}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className={cx(
        "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 scrollbar-none",
        bleed ? "-mx-gutter scroll-px-gutter px-gutter lg:mx-0 lg:px-0" : "scroll-px-0",
        desktop === "grid" &&
          "lg:grid lg:grid-cols-[repeat(auto-fit,minmax(14rem,1fr))] lg:overflow-visible",
        className,
      )}
    >
      {Children.toArray(children).map((child, i) => (
        <div
          key={i}
          role="listitem"
          className={cx(
            "flex shrink-0 snap-start",
            WIDTH[itemWidth],
            desktop === "grid" && "lg:w-auto lg:shrink",
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
