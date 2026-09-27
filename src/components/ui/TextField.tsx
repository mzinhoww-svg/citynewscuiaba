"use client";

import { useState, type ChangeEvent, type CSSProperties } from "react";
import { UI } from "@/content/pt-BR/ui";
import { cx } from "../cx";
import { Icon, type IconName } from "./Icon";

export interface TextFieldProps {
  /** Liga rótulo, dica e erro (aria-describedby). */
  id: string;
  /** Rótulo sempre visível. */
  label: string;
  icon?: IconName;
  type?: "text" | "email" | "password" | "tel";
  name?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  required?: boolean;
  /** Ajuda abaixo do campo. */
  hint?: string;
  /** Erro com ícone e texto; inclua um exemplo ("Exemplo: ana@exemplo.com"). */
  error?: string;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * Campo de formulário das telas de conta e configurações: rótulo acima, campo branco de 52 px
 * com borda de controle visível (R4) e ícone de contorno à esquerda.
 *
 * ```tsx
 * <TextField id="email" label="E-mail ou telefone" icon="mail" placeholder="Digite seu e-mail ou telefone" />
 * <TextField id="senha" label="Senha" icon="lock" type="password" placeholder="Crie sua senha" />
 * ```
 * - Foco: borda Tinta 2 px e anel Urucum (R4, R5). `error`: borda vermelha, ícone e mensagem.
 * - Senha: botão "Mostrar senha" com `aria-pressed` (R6).
 */
export function TextField({
  id,
  label,
  icon,
  type = "text",
  name,
  placeholder,
  value,
  defaultValue,
  onChange,
  autoComplete,
  required,
  hint,
  error,
  disabled = false,
  className,
  style,
}: TextFieldProps) {
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const hintId = hint ? `${id}-dica` : undefined;
  const errorId = error ? `${id}-erro` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cx("flex flex-col gap-2", className)} style={style}>
      <label htmlFor={id} className="type-label text-16 text-strong">
        {label}
      </label>
      <div
        className={cx(
          "border-control control-field flex h-input items-center gap-3 rounded-lg bg-input pl-4",
          isPassword ? "pr-1" : "pr-4",
          "transition-[border-color,box-shadow] duration-(--dur-base) ease-(--ease-standard)",
          error && "field-error",
          disabled && "opacity-60",
        )}
      >
        {icon && <Icon name={icon} color="var(--text-placeholder)" />}
        <input
          id={id}
          name={name}
          type={isPassword && show ? "text" : type}
          placeholder={placeholder}
          value={value}
          defaultValue={defaultValue}
          onChange={onChange}
          autoComplete={autoComplete}
          required={required}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className="min-w-0 flex-1 bg-transparent type-body text-strong placeholder:text-placeholder disabled:cursor-not-allowed"
        />
        {isPassword && (
          <button
            type="button"
            aria-label={UI.showPassword}
            aria-pressed={show}
            aria-controls={id}
            disabled={disabled}
            onClick={() => setShow((s) => !s)}
            className="flex size-tap shrink-0 cursor-pointer items-center justify-center rounded-pill text-meta hover:text-strong"
          >
            <Icon name={show ? "eye-off" : "eye"} />
          </button>
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
