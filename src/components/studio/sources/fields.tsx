"use client";

import type { ReactNode } from "react";
import { FIELD_TEXT } from "@/content/pt-BR/sources-admin-detail";
import { cx } from "../../cx";
import { Icon } from "../../ui/Icon";

/**
 * Peças internas dos formulários do painel de fontes (assistente e aba Configuração): rótulo
 * visível, dica e erro ligados por `aria-describedby`, controle com a borda de controle do kit
 * (R4). Controladas (o formulário precisa do valor para o diff de mudança crítica e para a prévia
 * da frequência), ao contrário do `Select` do kit, que é só para formulários GET.
 */

export const CONTROL_CLASS =
  "border-control h-input w-full rounded-lg bg-input px-4 type-body text-strong disabled:cursor-not-allowed disabled:bg-section";

export function describedBy(id: string, hint?: ReactNode, error?: string | null) {
  return (
    [hint ? `${id}-dica` : null, error ? `${id}-erro` : null].filter(Boolean).join(" ") || undefined
  );
}

export interface FieldShellProps {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Conteúdo à direita do rótulo (selo "Mudança crítica", "opcional"). */
  aside?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function FieldShell({
  id,
  label,
  hint,
  error,
  aside,
  children,
  className,
}: FieldShellProps) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <label htmlFor={id} className="type-label text-16 text-strong">
          {label}
        </label>
        {aside}
      </div>
      {children}
      {hint && (
        <div id={`${id}-dica`} className="type-meta text-meta">
          {hint}
        </div>
      )}
      {error && (
        <p id={`${id}-erro`} className="flex items-start gap-1.5 type-meta text-danger">
          <Icon name="circle-alert" size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  );
}

export interface OptionLike {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface OptionGroupLike {
  label: string;
  options: readonly OptionLike[];
}

export function NativeSelect({
  id,
  name,
  value,
  onChange,
  options,
  groups,
  hint,
  error,
  disabled,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly OptionLike[];
  groups?: readonly OptionGroupLike[];
  hint?: ReactNode;
  error?: string | null;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        id={id}
        name={name}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(
          CONTROL_CLASS,
          "cursor-pointer appearance-none pr-11",
          error && "field-error",
        )}
      >
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {groups?.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value} disabled={o.disabled}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
      <Icon
        name="chevron-down"
        size={20}
        className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-meta"
      />
    </div>
  );
}

/**
 * Rótulo + `NativeSelect`: dica e erro informados uma vez só (o `FieldShell` renderiza os
 * elementos; o `<select>` recebe o `aria-describedby` correspondente). `children` entra depois
 * do controle e antes da dica (prévia da frequência).
 */
export function SelectField({
  id,
  name,
  label,
  value,
  onChange,
  options,
  groups,
  hint,
  error,
  aside,
  disabled,
  className,
  children,
}: {
  id: string;
  name: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly OptionLike[];
  groups?: readonly OptionGroupLike[];
  hint?: ReactNode;
  error?: string | null;
  aside?: ReactNode;
  disabled?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} aside={aside} className={className}>
      <NativeSelect
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        options={options}
        groups={groups}
        hint={hint}
        error={error}
        disabled={disabled}
      />
      {children}
    </FieldShell>
  );
}

/** Selo de campo crítico: ícone + texto, nunca só cor. */
export function CriticalBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-xs border border-warn bg-atencao-soft px-2 py-0.5 type-meta font-semibold text-warn">
      <Icon name="shield" size={14} />
      {children}
    </span>
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
            className="size-5 shrink-0 accent-action-primary"
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
    <FieldShell
      id={id}
      label={FIELD_TEXT.justification}
      hint={FIELD_TEXT.justificationHint}
      error={error}
      aside={<CriticalBadge>{FIELD_TEXT.critical}</CriticalBadge>}
    >
      <textarea
        id={id}
        name="justification"
        value={value}
        rows={3}
        required
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, FIELD_TEXT.justificationHint, error)}
        className={cx(
          "border-control min-h-24 w-full rounded-lg bg-input px-4 py-3 type-body text-strong",
          error && "field-error",
        )}
      />
    </FieldShell>
  );
}
