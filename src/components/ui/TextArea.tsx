"use client";

import { useState, type ReactNode } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { describedBy, FieldShell } from "./Field";

export interface TextAreaProps {
  id: string;
  name: string;
  /** Rótulo sempre visível. */
  label: string;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  rows?: number;
  /** Limite de caracteres; mostra o contador "n/máx" abaixo do campo. */
  maxLength?: number;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  placeholder?: string;
  /** Conteúdo à direita do rótulo (ex.: "opcional"). */
  aside?: ReactNode;
  className?: string;
}

/**
 * Texto longo com a moldura de campo do kit: borda de controle no contêiner (`control-field`,
 * mesma troca de borda no foco do `TextField`, item 27), erro ligado ao campo (item 26) e contador
 * quando há `maxLength`.
 *
 * ```tsx
 * <TextArea id="motivo" name="motivo" label="Motivo" maxLength={280} error={erro} />
 * ```
 */
export function TextArea({
  id,
  name,
  label,
  value,
  defaultValue,
  onChange,
  rows = 4,
  maxLength,
  hint,
  error,
  required,
  readOnly,
  disabled,
  placeholder,
  aside,
  className,
}: TextAreaProps) {
  const [draft, setDraft] = useState(defaultValue ?? "");
  const length = (value ?? draft).length;
  const counterId = `${id}-contador`;
  const described = [describedBy(id, hint, error), maxLength ? counterId : null]
    .filter(Boolean)
    .join(" ");

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
          "border-control control-field rounded-lg bg-input",
          "transition-[border-color,box-shadow] duration-(--dur-base) ease-(--ease-standard)",
          "has-[:disabled]:bg-section",
          error && "field-error",
        )}
      >
        <textarea
          id={id}
          name={name}
          rows={rows}
          maxLength={maxLength}
          required={required}
          readOnly={readOnly}
          disabled={disabled}
          placeholder={placeholder}
          {...(value !== undefined ? { value } : { defaultValue })}
          onChange={(e) => {
            if (value === undefined) setDraft(e.target.value);
            onChange?.(e.target.value);
          }}
          aria-invalid={error ? true : undefined}
          aria-describedby={described || undefined}
          className="block min-h-24 w-full resize-y rounded-lg bg-transparent px-4 py-3 type-body text-strong placeholder:text-placeholder disabled:cursor-not-allowed"
        />
      </div>
      {maxLength !== undefined && (
        <p id={counterId} className="self-end type-meta text-meta tabular-nums">
          <span aria-hidden="true">{UI.charCount(length, maxLength)}</span>
          <span className="sr-only">{UI.charCountLabel(length, maxLength)}</span>
        </p>
      )}
    </FieldShell>
  );
}
