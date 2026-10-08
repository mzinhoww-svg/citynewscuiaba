"use client";

import type { ReactNode } from "react";
import { FIELD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { describedBy, FieldShell } from "../../ui/Field";
import { Icon } from "../../ui/Icon";
import { StatusBadge } from "../../ui/StatusBadge";
import { TextArea } from "../../ui/TextArea";

/**
 * Peças internas dos formulários do painel de fontes (assistente e aba Configuração): rótulo
 * visível, dica e erro ligados por `aria-describedby`, controle com a borda de controle do kit
 * (R4). Controladas (o formulário precisa do valor para o diff de mudança crítica e para a prévia
 * da frequência). As listas de opções usam `Select`/`SelectControl` do kit direto.
 */

export const CONTROL_CLASS =
  "border-control h-input w-full rounded-lg bg-input px-4 type-body text-strong disabled:cursor-not-allowed disabled:bg-section";

/**
 * Moldura e ids de dica/erro moveram para `ui/Field` (UX-W2-T2); reexportados aqui até as
 * migrações da W2-T11 trocarem os imports.
 */
export { describedBy, FieldShell, type FieldShellProps } from "../../ui/Field";

export interface OptionLike {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface OptionGroupLike {
  label: string;
  options: readonly OptionLike[];
}

/** Selo de campo crítico: ícone + texto, nunca só cor. */
export function CriticalBadge({ children }: { children: ReactNode }) {
  return (
    <StatusBadge tone="warn" icon="shield">
      {children}
    </StatusBadge>
  );
}

/** Mensagem de resultado de uma ação: sucesso em `status`, falha em `alert`. */
export function ActionMessage({
  result,
  children,
}: {
  result: { ok: boolean; message: string } | null;
  children?: ReactNode;
}) {
  if (!result) return null;
  return (
    <div
      role={result.ok ? "status" : "alert"}
      className={cx(
        "flex flex-wrap items-center gap-3 rounded-lg border px-4 py-3 type-body text-strong",
        result.ok ? "border-line-section bg-cerrado-soft" : "border-danger bg-erro-soft",
      )}
    >
      <Icon
        name={result.ok ? "check" : "circle-alert"}
        size={18}
        className={result.ok ? "text-service" : "text-danger"}
      />
      <span className="min-w-0 flex-1">{result.message}</span>
      {children}
    </div>
  );
}

export function TextInput({
  id,
  label,
  value,
  onChange,
  type = "text",
  inputMode,
  hint,
  error,
  aside,
  disabled,
  name,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: "text" | "url" | "date";
  inputMode?: "text" | "numeric" | "url";
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside}>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(CONTROL_CLASS, error && "field-error")}
      />
    </FieldShell>
  );
}

export function CheckboxField({
  id,
  label,
  checked,
  onChange,
  hint,
  aside,
  disabled,
  name,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  aside?: ReactNode;
  disabled?: boolean;
  name?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={id} className="flex min-h-tap items-center gap-2.5 type-body text-strong">
          <input
            id={id}
            name={name}
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            aria-describedby={hint ? `${id}-dica` : undefined}
            className="size-5 shrink-0 accent-(--action-primary)"
          />
          {label}
        </label>
        {aside}
      </div>
      {hint && (
        <p id={`${id}-dica`} className="type-meta text-meta">
          {hint}
        </p>
      )}
    </div>
  );
}

export function JustificationField({
  id,
  value,
  onChange,
  error,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
}) {
  return (
    <TextArea
      id={id}
      name="justification"
      label={FIELD_TEXT.justification}
      hint={FIELD_TEXT.justificationHint}
      error={error}
      aside={<CriticalBadge>{FIELD_TEXT.critical}</CriticalBadge>}
      value={value}
      rows={3}
      required
      onChange={onChange}
    />
  );
}
