"use client";

import { useId, type ReactNode } from "react";
import { cx } from "../cx";

export interface CheckboxProps {
  /** Sem `id`, um id estável é gerado (a dica precisa dele). */
  id?: string;
  name: string;
  label: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  onChange?: (checked: boolean) => void;
  hint?: ReactNode;
  disabled?: boolean;
  /** Valor enviado no formulário quando marcado (padrão do navegador: "on"). */
  value?: string;
  className?: string;
}

/**
 * Caixa de seleção nativa de 20 px numa linha com alvo de toque (`min-h-tap`), cor única de ação
 * (`accent-(--action-primary)`, item 44) e dica ligada por `aria-describedby`.
 *
 * ```tsx
 * <Checkbox name="avisos" label="Receber avisos" hint="Uma vez por dia" />
 * ```
 */
export function Checkbox({
  id,
  name,
  label,
  checked,
  defaultChecked,
  onChange,
  hint,
  disabled,
  value,
  className,
}: CheckboxProps) {
  const auto = useId();
  const boxId = id ?? auto;
  const hintId = hint ? `${boxId}-dica` : undefined;
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label
        htmlFor={boxId}
        className="flex min-h-tap cursor-pointer items-center gap-2.5 type-body text-strong has-[:disabled]:cursor-not-allowed"
      >
        <input
          id={boxId}
          name={name}
          type="checkbox"
          value={value}
          {...(checked !== undefined
            ? { checked, readOnly: onChange ? undefined : true }
            : { defaultChecked })}
          onChange={onChange ? (e) => onChange(e.target.checked) : undefined}
          disabled={disabled}
          aria-describedby={hintId}
          className="size-5 shrink-0 cursor-pointer accent-(--action-primary) disabled:cursor-not-allowed"
        />
        {label}
      </label>
      {hint && (
        <p id={hintId} className="pl-7.5 type-meta text-meta">
          {hint}
        </p>
      )}
    </div>
  );
}
