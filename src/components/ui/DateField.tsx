import type { ChangeEvent, ReactNode } from "react";
import { cx } from "../cx";
import { describedBy, FieldShell } from "./Field";

export interface DateFieldProps {
  id: string;
  name: string;
  /** Rótulo sempre visível. */
  label: string;
  type?: "date" | "datetime-local" | "time";
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  min?: string;
  max?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  /** Conteúdo à direita do rótulo (ex.: "opcional"). */
  aside?: ReactNode;
  className?: string;
}

/**
 * Data, data e hora ou hora com o seletor nativo do sistema e a moldura de campo do kit (borda
 * no contêiner com `control-field`, erro ligado ao campo). Funciona sem JavaScript em formulário GET.
 *
 * ```tsx
 * <DateField id="inicio" name="inicio" label="Início" type="datetime-local" error={erro} />
 * ```
 */
export function DateField({
  id,
  name,
  label,
  type = "date",
  value,
  defaultValue,
  onChange,
  min,
  max,
  hint,
  error,
  required,
  disabled,
  aside,
  className,
}: DateFieldProps) {
  return (
    <FieldShell
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      aside={aside}
      className={className}
    >
      <div
        className={cx(
          "border-control control-field flex h-input items-center rounded-lg bg-input px-4",
          "transition-[border-color,box-shadow] duration-(--dur-base) ease-(--ease-standard)",
          "has-[:disabled]:bg-section",
          error && "field-error",
        )}
      >
        <input
          id={id}
          name={name}
          type={type}
          {...(value !== undefined ? { value } : { defaultValue })}
          onChange={
            onChange ? (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value) : undefined
          }
          readOnly={value !== undefined && !onChange ? true : undefined}
          min={min}
          max={max}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className="min-w-0 flex-1 bg-transparent type-body text-strong disabled:cursor-not-allowed"
        />
      </div>
    </FieldShell>
  );
}
