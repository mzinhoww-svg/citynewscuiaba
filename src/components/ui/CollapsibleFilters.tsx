"use client";

import Link from "next/link";
import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { FILTERS_TEXT } from "@/content/pt-BR/filters";
import { cx } from "../cx";
import { Icon } from "./Icon";

// Mesmo corte do `lg:` do Tailwind (64rem).
const DESKTOP = "(min-width: 64rem)";

function subscribeDesktop(onChange: () => void) {
  const mq = window.matchMedia?.(DESKTOP);
  mq?.addEventListener?.("change", onChange);
  return () => mq?.removeEventListener?.("change", onChange);
}
const isDesktop = () => window.matchMedia?.(DESKTOP)?.matches ?? false;

export interface CollapsibleFiltersProps {
  /** Quantos filtros diferem do padrão: vira "2 ativos" no botão e libera o Limpar. */
  activeCount?: number;
  /** Destino do "Limpar filtros", visível mesmo com o painel recolhido. */
  clearHref?: string;
  clearLabel?: string;
  /** Ações que ficam ao lado do botão (exportar CSV etc.), sempre à vista. */
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes do corpo (o formulário costuma trazer o próprio layout). */
  bodyClassName?: string;
}

/**
 * Painel de filtros recolhível, o mesmo no portal e no Estúdio. Sem escolha da pessoa, o estado
 * vem só do CSS: recolhido abaixo de `lg` e aberto no desktop, sem salto de layout ao hidratar.
 * O botão alterna em qualquer tela. A contagem de filtros ativos e o "Limpar filtros" ficam no
 * cabeçalho, à vista mesmo recolhido. Sem JavaScript o corpo aparece sempre (`noscript`).
 *
 * ```tsx
 * <CollapsibleFilters activeCount={2} clearHref="/estudio/fila">
 *   <form method="get">…</form>
 * </CollapsibleFilters>
 * ```
 */
export function CollapsibleFilters({
  activeCount = 0,
  clearHref,
  clearLabel = FILTERS_TEXT.clear,
  actions,
  children,
  className,
  bodyClassName,
}: CollapsibleFiltersProps) {
  const bodyId = useId();
  // null = padrão da tela (CSS); true/false = escolha da pessoa.
  const [choice, setChoice] = useState<boolean | null>(null);
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => false);
  const open = choice ?? desktop;

  return (
    <div data-collapsible-filters="" className={className}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={FILTERS_TEXT.button(activeCount)}
          onClick={() => setChoice(!open)}
          className="inline-flex min-h-tap cursor-pointer items-center gap-2 rounded-sm text-16 font-semibold text-strong"
        >
          <Icon name="sliders-horizontal" size={20} />
          <span>{FILTERS_TEXT.label}</span>
          {activeCount > 0 && (
            <span
              aria-hidden="true"
              className="rounded-pill bg-section px-2 py-0.5 type-meta font-semibold text-strong"
            >
              {FILTERS_TEXT.active(activeCount)}
            </span>
          )}
          <Icon
            name="chevron-down"
            size={18}
            className={cx(
              "text-meta transition-transform duration-(--dur-fast) motion-reduce:transition-none",
              choice === null ? "lg:rotate-180" : open && "rotate-180",
            )}
          />
        </button>
        {activeCount > 0 && clearHref && (
          <Link
            href={clearHref}
            className="inline-flex min-h-tap items-center text-14 font-semibold whitespace-nowrap text-link underline underline-offset-4 hover:text-strong"
          >
            {clearLabel}
          </Link>
        )}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <div
        id={bodyId}
        data-filters-body=""
        className={cx(
          "pt-3",
          choice === null ? "hidden lg:block" : choice ? "block" : "hidden",
          bodyClassName,
        )}
      >
        {children}
      </div>
      <noscript>
        <style>{`[data-filters-body]{display:block!important}`}</style>
      </noscript>
    </div>
  );
}
