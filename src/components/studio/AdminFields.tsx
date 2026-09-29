import type { ReactNode } from "react";

export const FIELD_CLASS = "border-control h-tap rounded-lg bg-input px-4 type-body text-strong";

export interface AdminFieldProps {
  id: string;
  name: string;
  label: string;
  hint?: string;
  type?: "text" | "email" | "url" | "date" | "time" | "number";
  defaultValue?: string;
  required?: boolean;
  disabled?: boolean;
  maxLength?: number;
  min?: number;
  max?: number;
  multiline?: boolean;
}

/** Campo de formulário da Administração: rótulo visível, dica ligada por `aria-describedby`. */
export function AdminField({
  id,
  name,
  label,
  hint,
  type = "text",
  defaultValue,
  required,
  disabled,
  maxLength,
  min,
  max,
  multiline,
}: AdminFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="type-label text-16 text-strong">
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          name={name}
          rows={3}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          aria-describedby={hintId}
          className="border-control rounded-lg bg-input px-4 py-3 type-body text-strong"
        />
      ) : (
        <input
          id={id}
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          disabled={disabled}
          maxLength={maxLength}
          min={min}
          max={max}
          aria-describedby={hintId}
          className={FIELD_CLASS}
        />
      )}
      {hint && (
        <p id={hintId} className="type-meta text-meta">
          {hint}
        </p>
      )}
    </div>
  );
}

/** Bloco com título de seção e conteúdo (h2). */
export function AdminBlock({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="type-section text-strong">
        {title}
      </h2>
      {children}
    </section>
  );
}
