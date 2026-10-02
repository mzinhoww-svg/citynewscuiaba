"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface SegmentedToggleOption {
  value: string;
  label: string;
  icon?: IconName;
}

export interface SegmentedToggleProps {
  /** Nome do grupo (ex.: "Tema de leitura"). */
  label: string;
  options: SegmentedToggleOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (v: string) => void;
  className?: string;
}

/**
 * Chave em pílula entre 2 ou 3 valores, como o tema de leitura.
 *
 * ```tsx
 * <SegmentedToggle label="Tema" options={[{ value: "light", label: "Claro", icon: "sun" }, { value: "dark", label: "Escuro", icon: "moon" }]} />
 * ```
 * - Grupo de rádio: uma opção por vez, setas trocam a opção. Ícone e texto visíveis.
 */
export function SegmentedToggle({
  label,
  options,
  value,
  defaultValue,
  onChange,
  className,
}: SegmentedToggleProps) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  const refs = useRef<Array<HTMLButtonElement | null>>([]);

  const select = (v: string) => {
    if (value === undefined) setInner(v);
    onChange?.(v);
  };
  const onKeyDown = (e: KeyboardEvent, index: number) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = (index + delta + options.length) % options.length;
    const option = options[next];
    if (!option) return;
    select(option.value);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cx("inline-flex gap-0.5 rounded-pill bg-section p-0.5", className)}
    >
      {options.map((o, i) => {
        const active = o.value === current;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => select(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cx(
              "flex min-h-tap cursor-pointer items-center gap-1.5 rounded-pill px-3.5 text-14 leading-none",
              active
                ? "bg-card-white font-semibold text-link shadow-sm"
                : "font-medium text-meta hover:text-strong",
            )}
          >
            {o.icon && <Icon name={o.icon} size={16} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
