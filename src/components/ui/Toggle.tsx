"use client";

import { useState } from "react";
import { cx } from "../cx";

export interface ToggleProps {
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  disabled?: boolean;
  /** Nome acessível (obrigatório quando não há rótulo visível associado). */
  label: string;
  className?: string;
}

/**
 * Interruptor liga/desliga das linhas de configuração; ligado usa Cerrado (utilidade).
 *
 * ```tsx
 * <Toggle defaultChecked label="Notificações" />
 * ```
 * - Trilho de 40×24 dentro de um alvo de 44 px. Desligado tem trilho com borda de controle
 *   (≥ 3:1), então o estado não depende só de cor: o botão muda de lado.
 */
export function Toggle({
  checked,
  defaultChecked = false,
  onChange,
  disabled = false,
  label,
  className,
}: ToggleProps) {
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (checked === undefined) setInner(!on);
        onChange?.(!on);
      }}
      className={cx(
        "group inline-flex min-h-tap min-w-tap shrink-0 cursor-pointer items-center justify-center rounded-pill",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cx(
          "flex h-6 w-10 items-center rounded-pill p-0.5 transition-colors duration-(--dur-base) ease-(--ease-standard)",
          on ? "bg-accent-service" : "bg-line-control",
        )}
      >
        <span
          className={cx(
            "size-5 rounded-pill bg-branco shadow-sm transition-transform duration-(--dur-base) ease-(--ease-standard)",
            on && "translate-x-4",
          )}
        />
      </span>
    </button>
  );
}
