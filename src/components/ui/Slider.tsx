"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { cx } from "../cx";

export interface SliderProps {
  /** Nome acessível do controle. */
  label: string;
  value?: number;
  defaultValue?: number;
  min?: number;
  max?: number;
  /** Número de paradas discretas, ex.: 7 para tamanho de fonte. */
  steps?: number;
  onChange?: (v: number) => void;
  /** Texto lido junto com o valor (ex.: "Tamanho 3 de 7"). */
  valueText?: (v: number) => string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  className?: string;
}

/**
 * Controle deslizante das configurações de leitura (tamanho do texto, brilho), preenchido em
 * Urucum; paradas discretas opcionais e adornos nas pontas (A / A, sol).
 *
 * ```tsx
 * <Slider label="Tamanho do texto" steps={7} defaultValue={50} startAdornment={<span className="text-16">A</span>} endAdornment={<span className="text-28">A</span>} />
 * ```
 * - `<input type="range">` nativo: teclado (setas, Home, End) e leitores de tela de graça.
 */
export function Slider({
  label,
  value,
  defaultValue = 50,
  min = 0,
  max = 100,
  steps,
  onChange,
  valueText,
  startAdornment,
  endAdornment,
  className,
}: SliderProps) {
  const [inner, setInner] = useState(defaultValue);
  const current = value ?? inner;
  const pct = ((current - min) / (max - min)) * 100;
  const step = steps && steps > 1 ? (max - min) / (steps - 1) : 1;
  return (
    <div className={cx("flex items-center gap-4", className)}>
      {startAdornment && <span aria-hidden="true">{startAdornment}</span>}
      <input
        type="range"
        aria-label={label}
        aria-valuetext={valueText?.(current)}
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => {
          const next = Number(e.target.value);
          if (value === undefined) setInner(next);
          onChange?.(next);
        }}
        style={{ "--cn-range-fill": `${pct}%` } as CSSProperties}
        className="cn-range min-h-tap flex-1 cursor-pointer"
      />
      {endAdornment && <span aria-hidden="true">{endAdornment}</span>}
    </div>
  );
}
