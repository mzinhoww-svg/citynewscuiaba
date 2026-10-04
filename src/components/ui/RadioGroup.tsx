import type { ChangeEvent } from "react";
import { cx } from "../cx";
import { FieldError } from "./Field";

export interface RadioOption {
  value: string;
  label: string;
  hint?: string;
}

export interface RadioGroupProps {
  /** Também é a base dos ids (`<name>-<valor>`, `<name>-erro`). */
  name: string;
  /** Nome do grupo, lido pelo leitor de tela ao entrar no primeiro rádio. */
  legend: string;
  options: readonly RadioOption[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  error?: string | null;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

/**
 * Escolha única entre poucas opções visíveis: `fieldset` com `legend` (papel `group`), cada rádio
 * numa linha com alvo de toque e dica própria. Com `error`, o grupo e cada rádio apontam para a
 * mensagem por `aria-describedby` (item 26; o papel `radio` não aceita `aria-invalid`). Funciona
 * sem JavaScript em formulário GET.
 *
 * ```tsx
 * <RadioGroup name="frequencia" legend="Frequência" options={opcoes} defaultValue="dia" />
 * ```
 */
export function RadioGroup({
  name,
  legend,
  options,
  value,
  defaultValue,
  onChange,
  error,
  required,
  disabled,
  className,
}: RadioGroupProps) {
  const errorId = error ? `${name}-erro` : undefined;
  return (
    <fieldset
      className={cx("flex min-w-0 flex-col gap-1", className)}
      aria-describedby={errorId}
      disabled={disabled}
    >
      <legend className="mb-1 type-label text-strong">{legend}</legend>
      {options.map((o) => {
        const optionId = `${name}-${o.value}`;
        const hintId = o.hint ? `${optionId}-dica` : undefined;
        const described = [hintId, errorId].filter(Boolean).join(" ") || undefined;
        return (
          <div key={o.value} className="flex flex-col">
            <label
              htmlFor={optionId}
              className="flex min-h-tap cursor-pointer items-center gap-2.5 type-body text-strong has-[:disabled]:cursor-not-allowed"
            >
              <input
                id={optionId}
                name={name}
                type="radio"
                value={o.value}
                {...(value !== undefined
                  ? { checked: value === o.value, readOnly: onChange ? undefined : true }
                  : { defaultChecked: defaultValue === o.value })}
                onChange={
                  onChange
                    ? (e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)
                    : undefined
                }
                required={required}
                aria-describedby={described}
                className="size-5 shrink-0 cursor-pointer accent-(--action-primary) disabled:cursor-not-allowed"
              />
              {o.label}
            </label>
            {o.hint && (
              <p id={hintId} className="pb-1 pl-7.5 type-meta text-meta">
                {o.hint}
              </p>
            )}
          </div>
        );
      })}
      <FieldError id={name} error={error} />
    </fieldset>
  );
}
