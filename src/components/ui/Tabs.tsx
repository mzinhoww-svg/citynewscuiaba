"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cx } from "../cx";

export interface TabsProps {
  /** Nome da lista de abas. */
  label: string;
  items: string[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  /** Prefixo de id; a aba i controla `${idPrefix}-painel-${i}` quando o painel existir. */
  idPrefix?: string;
  className?: string;
}

/**
 * Abas segmentadas de largura igual que trocam uma lista de resultados (Matérias, Temas,
 * Autores na Busca).
 *
 * ```tsx
 * <Tabs label="Resultados" items={["Matérias", "Temas", "Autores"]} defaultValue="Temas" />
 * ```
 * - `tablist` com foco itinerante: setas, Home e End trocam de aba.
 */
export function Tabs({
  label,
  items,
  value,
  defaultValue,
  onChange,
  idPrefix,
  className,
}: TabsProps) {
  const [inner, setInner] = useState(defaultValue ?? items[0]);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (index: number) => {
    const it = items[index];
    if (it === undefined) return;
    if (value === undefined) setInner(it);
    onChange?.(it);
    refs.current[index]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const last = items.length - 1;
    const target =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (target === null) return;
    e.preventDefault();
    select(target);
  };

  return (
    <div role="tablist" aria-label={label} className={cx("flex gap-2", className)}>
      {items.map((it, i) => {
        const active = it === current;
        return (
          <button
            key={it}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={idPrefix ? `${idPrefix}-aba-${i}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-painel-${i}` : undefined}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "min-h-tap flex-1 cursor-pointer rounded-pill px-3 text-14 leading-none",
              active
                ? "bg-action-primary font-semibold text-on-inverse"
                : "bg-section font-medium text-meta hover:bg-nevoa-2 hover:text-strong",
            )}
          >
            {it}
          </button>
        );
      })}
    </div>
  );
}
