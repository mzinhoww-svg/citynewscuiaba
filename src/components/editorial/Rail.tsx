"use client";

import { Children, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../cx";
import { useScrollEdges } from "./use-scroll-edges";

export interface RailProps {
  /** Nome da lista, lido por leitores de tela. */
  label: string;
  children: ReactNode;
  /** sm = 14 rem · md = 18 rem (padrão) · auto = largura do conteúdo (avatares). */
  itemWidth?: "sm" | "md" | "auto";
  /** No desktop o trilho vira grade sem rolagem (padrão: continua rolando). */
  desktop?: "scroll" | "grid";
  /** Sangra até a borda da tela no celular (padrão). Dentro de uma superfície com padding, false. */
  bleed?: boolean;
  className?: string;
}

const WIDTH = { sm: "w-56", md: "w-72", auto: "w-auto" } as const;

/**
 * Trilho horizontal da home (assuntos, coleções, agenda, serviços): lista nomeada que rola com
 * encaixe obrigatório, sem rolagem automática. Só quando há o que rolar o trilho entra na ordem
 * do Tab (UX item 77); aí as setas andam um item, Home e End vão às pontas; Tab continua passando
 * pelos links de cada item. No celular, a borda que ainda tem itens esmaece (`scroll-fade` num
 * invólucro, nunca na lista rolável: máscara ali vira bloco preto no Safari do iPhone, A-152).
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
  const { ref, scrollable, fade } = useScrollEdges<HTMLDivElement>();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
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
    // O invólucro leva o véu de borda e a sangria; a lista dentro dele é quem rola.
    <div data-fade={fade} className={cx("max-lg:scroll-fade", bleed && "-mx-gutter lg:mx-0")}>
      <div
        ref={ref}
        role="list"
        aria-label={label}
        tabIndex={scrollable ? 0 : undefined}
        onKeyDown={onKeyDown}
        className={cx(
          "flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 scrollbar-none",
          bleed ? "scroll-px-gutter px-gutter lg:px-0" : "scroll-px-0",
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
    </div>
  );
}
