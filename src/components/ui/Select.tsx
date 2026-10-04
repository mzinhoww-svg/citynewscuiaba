import type { ChangeEvent } from "react";
import type { ReactNode } from "react";
import { cx } from "../cx";
import { Icon } from "./Icon";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  id: string;
  /** Rótulo sempre visível. */
  label: string;
  name: string;
  options: readonly SelectOption[];
  defaultValue?: string;
  /** Controlado (formulários interativos); sem ele, o campo é livre (`defaultValue`). */
  value?: string;
  onChange?: (value: string) => void;
  /** Primeira opção sem valor ("Todos os bairros"). */
  placeholder?: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Campo só de leitura (modo leitura do editor): não abre nem muda. */
  disabled?: boolean;
  /** Conteúdo extra à direita do rótulo (ex.: "opcional"). */
  labelAside?: ReactNode;
  className?: string;
}

/**
 * Lista de opções nativa com o visual de campo do kit (borda de controle R4, anel R5). Funciona
 * sem JavaScript dentro de formulários GET (filtros na URL).
 *
 * ```tsx
 * <Select id="bairro" name="bairro" label="Bairro" placeholder="Todos os bairros" options={bairros} />
 * ```
 */
export function Select({
  id,
  label,
  name,
  options,
  defaultValue,
  value,
  onChange,
  placeholder,
  hint,
  error,
  required,
  disabled = false,
  labelAside,
  className,
}: SelectProps) {
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx("flex flex-col gap-2", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="type-label text-16 text-strong">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <select
          id={id}
          name={name}
          {...(value !== undefined
            ? { value, onChange: (e: ChangeEvent<HTMLSelectElement>) => onChange?.(e.target.value) }
            : { defaultValue: defaultValue ?? "" })}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cx(
            "border-control h-input w-full cursor-pointer appearance-none rounded-lg bg-input pr-11 pl-4 type-body text-strong",
            "disabled:cursor-not-allowed",
            error && "field-error",
          )}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {!disabled && (
          <Icon
            name="chevron-down"
            size={20}
            className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
          />
        )}
      </div>
      {hint && (
        <p id={hintId} className="type-meta text-meta">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 type-meta text-danger">
          <Icon name="circle-alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}
