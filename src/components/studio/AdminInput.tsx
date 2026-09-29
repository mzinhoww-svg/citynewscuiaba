import { cx } from "../cx";

export interface AdminInputProps {
  id: string;
  name: string;
  /** Rótulo lido por leitores de tela; visível só com `showLabel`. */
  label: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  maxLength?: number;
  showLabel?: boolean;
  className?: string;
}

/** Campo de texto compacto para linhas de tabela (rótulo oculto, mesmo visual de campo do kit). */
export function AdminInput({
  id,
  name,
  label,
  defaultValue,
  placeholder,
  required,
  maxLength,
  showLabel = false,
  className,
}: AdminInputProps) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className={showLabel ? "type-label text-strong" : "sr-only"}>
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        maxLength={maxLength}
        className="border-control h-input w-full min-w-32 rounded-lg bg-input px-3 type-body text-strong placeholder:text-placeholder"
      />
    </div>
  );
}
